// Auto火力种田王 V3.5（防掉线版）

auto.waitFor();
floaty.closeAll();

// ============================================================
// ============ 控制面板：改这7个数就行，下面自动变化 ============
// ============================================================
var PANEL = {
    WHEAT_COOLDOWN_SEC: 63,   // 小麦冷却秒数
    RICE_COOLDOWN_SEC: 243,   // 水稻冷却秒数
    RICE_EVERY_N_CHICKEN: 3,  // 鸡场真正处理满几轮后种一次水稻（水稻轮距）
    FACTORY_FEED_PULLS: 5,    // 中间两个铡刀坊（鸡场）各自的拖拽次数，默认5，对应鸡饲料x2
    CHOP_FEED_PULLS: 6,       // 下面铡刀坊（马场）的拖拽次数，默认6，对应马饲料x2
    CHICKEN_ENABLED: 1,       // 1=开启鸡场流程，0=关闭（关了的话水稻也不会触发种植）
    RANCH_ENABLED: 1          // 1=开启马场流程，0=关闭
};

// ================= 调试截图目录 =================
var DEBUG_DIR = '/sdcard/wheat_farm_debug/';
files.ensureDir(DEBUG_DIR);
(function cleanOldDebugImages() {
    try {
        var allFiles = files.listDir(DEBUG_DIR);
        if (allFiles && allFiles.length > 100) {
            allFiles.sort();
            var toDelete = allFiles.slice(0, allFiles.length - 100);
            for (var i = 0; i < toDelete.length; i++) {
                files.remove(DEBUG_DIR + toDelete[i]);
            }
            log('已清理 ' + toDelete.length + ' 张旧调试截图');
        }
    } catch (e) { log('清理旧截图异常: ' + e); }
})();

var captureStats = { total: 0, failed: 0 };

// ================= 实例锁 =================
var lockStorage = storages.create('wheat_farm_lock');
var LOCK_TIMEOUT_MS = 20000;
function acquireLock() {
    var last = lockStorage.get('heartbeat', 0);
    var now = Date.now();
    if (now - last < LOCK_TIMEOUT_MS) return false;
    lockStorage.put('heartbeat', now);
    return true;
}
function renewLock() { lockStorage.put('heartbeat', Date.now()); }
function releaseLock() { lockStorage.put('heartbeat', 0); }
function sleepWithHeartbeat(ms) {
    var remain = ms, chunk = 5000;
    while (remain > 0) {
        var t = Math.min(chunk, remain);
        sleep(t);
        remain -= t;
        renewLock();
    }
}
if (!acquireLock()) { exit(); }

// ================= 截屏权限 =================
function requestScreenCaptureAuto() {
    threads.start(function () {
        var btn = text("Start").findOne(5000);
        if (btn) btn.click();
    });
    var res = false;
    try { res = requestScreenCapture(); } catch (e) {}
    return res;
}

function safeCaptureScreen() {
    captureStats.total++;
    for (var attempt = 0; attempt < 3; attempt++) {
        try {
            var img = captureScreen();
            if (img) return img;
        } catch (e) {
            log('截屏异常 (尝试' + (attempt + 1) + '/3): ' + e);
        }
        if (attempt < 2) {
            if (requestScreenCaptureAuto() === false) {
                toastLog("你取消了截屏权限，脚本已终止。");
                releaseLock();
                engines.myEngine().forceStop();
            }
            sleep(1500);
        }
    }
    captureStats.failed++;
    log('截屏连续3次失败 (总计: ' + captureStats.total + ', 失败: ' + captureStats.failed + ')');
    return null;
}
setScreenMetrics(2412, 1080);

// ================= 全局配置 =================
var CONFIG = {
    CENTER_TILE: [1200, 540],
    targetTile: [1200, 540],
    seedIcon: [740, 910],
    riceSeedIcon: [935, 900],
    sickleIcon: [1220, 856],
    freeButtonPos: [1200, 672],
    LEFT_X: 170, RIGHT_X: 2250,
    warehouseBtn: [2350, 480],
    warehouseConfirmBtn: [1890, 230],
    returnToFieldBtn: [586, 662],
    wheatSlotInWarehouse: [790, 333],
    sellBtn: [780, 790],
    riceSlotInWarehouse: [980, 360],
    riceSellBtn: [980, 800],
    eggSlotInWarehouse: null,
    eggSellBtn: null,
    milkSlotInWarehouse: null,
    milkSellBtn: null,
    bubble_FT: [1280, 110],
    bubble_FB: [1320, 430],
    bubble_EL: [660, 220],
    bubble_ER: [1750, 220],
    build_FT: [1320, 400], enter_FT: [1240, 285],
    build_FB: [1320, 700], enter_FB: [1240, 360],
    build_CL: [590, 700],  enter_CL: [590, 390],
    build_CR: [1670, 700], enter_CR: [1670, 390],
    factoryFeedIcon: [1025, 910],
    coopFeedIcon: [1220, 940],
    coopChicken1: [580, 540],
    coopChicken6: [1880, 540],
    // ============ 马场 ============
    bubble_R1: [195, 853],
    bubble_R2: [1060, 853],
    bubble_CHOP: [620, 1060],
    build_R1: [80, 1025],  enter_R1: [455, 390],
    build_R2: [1325, 755], enter_R2: [1325, 390],
    build_CHOP: [975, 865], enter_CHOP: [880, 475],
    chopFeedIcon: [1216, 870],
    recenterTileAfterFarm: [1215, 775],
    recenterTileAfterRanch: [1500, 20],
    SAFE_CLOSE: [2290, 980],
    factoryPopupSafeClick: [1760, 400],
    coopPopupSafeClick: [1760, 320],
    // ============ 爆仓检测参数 ============
    warehouseFullCheckRegion: [800, 480, 200, 140],
    warehouseFullUniformTolerance: 12,
    warehouseFullColorRef: [235, 229, 203],
    warehouseFullColorTolerance: 20,
    warehouseFullCloseBtn: [2290, 980],
    FEED_DRAG_DIST: 200,
    FEED_DRAG_MS: 180,
    freeEligibleSeconds_Wheat: PANEL.WHEAT_COOLDOWN_SEC,
    freeEligibleSeconds_Rice: PANEL.RICE_COOLDOWN_SEC,
    freeWaitBufferMs: 4000,
    holdMs: 400,
    RICE_EVERY_N_CHICKEN_CYCLES: PANEL.RICE_EVERY_N_CHICKEN
};
var PARAMS = {
    wheat:      { topY: 151, bottomY: 924, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.seedIcon,     loop1Ms: 19, loop2Ms: 17, loop3Ms: 15 },
    rice:       { topY: 153, bottomY: 924, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.riceSeedIcon, loop1Ms: 22, loop2Ms: 21, loop3Ms: 20 },
    sickle:     { topY: 153, bottomY: 926, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.sickleIcon,   loop1Ms: 18, loop2Ms: 18, loop3Ms: 14 },
    riceSickle: { topY: 153, bottomY: 924, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.sickleIcon,   loop1Ms: 22, loop2Ms: 21, loop3Ms: 20 }
};
CONFIG.LOOP_COUNT = 3;

// ================= 加速酒 =================
var potionActive = false;
var potionStartTime = 0;
var potionHours = 6;
var POTION_EARLY_EXPIRE_MS = 5 * 60 * 1000;
function computeWaitSeconds(isRice) {
    var base = isRice ? CONFIG.freeEligibleSeconds_Rice : CONFIG.freeEligibleSeconds_Wheat;
    var seconds = base;
    if (potionActive) {
        var effectiveExpiryMs = potionHours * 3600000 - POTION_EARLY_EXPIRE_MS;
        var elapsedMs = Date.now() - potionStartTime;
        if (elapsedMs < effectiveExpiryMs) {
            seconds -= isRice ? 6 : 3;
        } else {
            potionActive = false;
        }
    }
    return seconds;
}

// ================= 状态变量 =================
var lastPlantTime = 0;
var isRiceRound = false;
var needSellEggs = false;
var needSellMilk = false;
var chickenCycleCount = 0;
var riceQueued = false;
var lastHarvestWasRice = null;
var skipNextSell = false;
var consecutiveWarehouseFullRecoveries = 0;
var MAX_CONSECUTIVE_WAREHOUSE_FULL_RECOVERIES = 3;
var chickenPendingRound = false;
var ranchPendingRound = false;
var bubbleDetectSuspended = false;

// ================= 悬浮控制/暂停状态 =================
var CTRL = {
    paused: false,
    settingsOpen: false,
    actionInProgress: true,
    currentPhase: 'harvest'
};
var skipToHarvestOnce = false;
var pendingMenuAlreadyOpen = false;
var pendingResumeChoice = null;
function PauseSignal() {}
function RecoveredCycleSignal(mode, menuAlreadyOpen) {
    this.mode = mode;
    this.menuAlreadyOpen = menuAlreadyOpen;
}
var PAUSE_CHECK_CHUNK_MS = 150;
var HEARTBEAT_INTERVAL_MS = 4000;
function pausableSleep(ms) {
    var remain = ms;
    var sinceHeartbeat = 0;
    while (remain > 0) {
        var chunk = Math.min(PAUSE_CHECK_CHUNK_MS, remain);
        sleep(chunk);
        remain -= chunk;
        sinceHeartbeat += chunk;
        if (sinceHeartbeat >= HEARTBEAT_INTERVAL_MS) {
            renewLock();
            sinceHeartbeat = 0;
        }
        if (CTRL.paused) {
            throw new PauseSignal();
        }
    }
}
function setActionInProgress(val) {
    CTRL.actionInProgress = val;
    if (ctrlWin) {
        ctrlWin.setBtn.post(function () {
            var locked = CTRL.actionInProgress && !CTRL.paused;
            try { ctrlWin.setBtn.setTextColor(colors.parseColor(locked ? "#555555" : "#CCCCCC")); } catch (e) {}
        });
    }
}
function refreshDriftReference() {
    var img = safeCaptureScreen();
    if (img) {
        if (referencePatch) referencePatch.recycle();
        referencePatch = images.clip(img, REF_REGION[0], REF_REGION[1], REF_REGION[2], REF_REGION[3]);
        img.recycle();
    }
    DriftGuard.reset();
}

// ================= 悬浮控制面板：校准持久化 =================
var calibStorage = storages.create('wheat_farm_calib');
var chickenCalibrated = !!calibStorage.get('chickenCalibrated', false);
var ranchCalibrated = !!calibStorage.get('ranchCalibrated', false);
if (chickenCalibrated) {
    CONFIG.eggSlotInWarehouse = calibStorage.get('eggSlot', null);
    CONFIG.eggSellBtn = calibStorage.get('eggBtn', null);
}
if (ranchCalibrated) {
    CONFIG.milkSlotInWarehouse = calibStorage.get('milkSlot', null);
    CONFIG.milkSellBtn = calibStorage.get('milkBtn', null);
}
var ctrlWin = null;

// ================= 参考图 =================
var referencePatch = null;
var REF_REGION = [1574, 326, 147, 128];
var DRIFT_SEARCH_MARGIN = 40;
function captureReferencePatch() {
    var img = safeCaptureScreen();
    if (!img) return;
    if (referencePatch) referencePatch.recycle();
    referencePatch = images.clip(img, REF_REGION[0], REF_REGION[1], REF_REGION[2], REF_REGION[3]);
    img.recycle();
}

// ================= 图像分析辅助 =================
function sampleRegionColors(img, region, stepX, stepY) {
    var x0 = region[0], y0 = region[1], w = region[2], h = region[3];
    var imgW = img.getWidth(), imgH = img.getHeight();
    var samples = [];
    for (var dx = 0; dx <= w; dx += stepX) {
        for (var dy = 0; dy <= h; dy += stepY) {
            var px = x0 + dx, py = y0 + dy;
            if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
                samples.push(images.pixel(img, px, py));
            }
        }
    }
    return samples;
}
function isRegionUniform(img, region, tolerance) {
    var samples = sampleRegionColors(img, region, 20, 20);
    if (samples.length < 4) return false;
    var r0 = colors.red(samples[0]), g0 = colors.green(samples[0]), b0 = colors.blue(samples[0]);
    for (var i = 1; i < samples.length; i++) {
        var c = samples[i];
        var diff = Math.max(
            Math.abs(colors.red(c) - r0),
            Math.abs(colors.green(c) - g0),
            Math.abs(colors.blue(c) - b0)
        );
        if (diff > tolerance) return false;
    }
    return true;
}
function regionMatchesRefColor(img, region, refColor, tolerance) {
    var samples = sampleRegionColors(img, region, 20, 20);
    if (samples.length === 0) return false;
    var sumR = 0, sumG = 0, sumB = 0;
    for (var i = 0; i < samples.length; i++) {
        sumR += colors.red(samples[i]);
        sumG += colors.green(samples[i]);
        sumB += colors.blue(samples[i]);
    }
    var avgR = sumR / samples.length, avgG = sumG / samples.length, avgB = sumB / samples.length;
    var diff = Math.max(
        Math.abs(avgR - refColor[0]),
        Math.abs(avgG - refColor[1]),
        Math.abs(avgB - refColor[2])
    );
    return diff <= tolerance;
}
function regionAvgColor(img, region) {
    var samples = sampleRegionColors(img, region, 20, 20);
    if (samples.length === 0) return [255, 255, 255];
    var sumR = 0, sumG = 0, sumB = 0;
    for (var i = 0; i < samples.length; i++) {
        sumR += colors.red(samples[i]);
        sumG += colors.green(samples[i]);
        sumB += colors.blue(samples[i]);
    }
    return [sumR / samples.length, sumG / samples.length, sumB / samples.length];
}
function regionAvgBrightness(img, region) {
    var avg = regionAvgColor(img, region);
    return (avg[0] + avg[1] + avg[2]) / 3;
}

// ============================================================
// ============ DriftGuard 三阶段容错偏移校验系统 ============
// ============================================================
var DriftGuard = {
    suspected: false,
    debugImgPaths: [],
    suspectCheckpoint: '',
    reset: function () {
        this.suspected = false;
        this.debugImgPaths = [];
        this.suspectCheckpoint = '';
    },
    saveDebugImg: function (img, label) {
        try {
            var ts = new java.text.SimpleDateFormat('yyyyMMdd_HHmmss_SSS').format(new Date());
            var path = DEBUG_DIR + ts + '_' + label + '.png';
            images.save(img, path);
            this.debugImgPaths.push(path);
            log('[DriftGuard] 调试截图: ' + path);
        } catch (e) {
            log('[DriftGuard] 保存调试截图失败: ' + e);
        }
    },
    matchReference: function (img) {
        if (!referencePatch) return true;
        var searchRegion = [
            Math.max(REF_REGION[0] - DRIFT_SEARCH_MARGIN, 0),
            Math.max(REF_REGION[1] - DRIFT_SEARCH_MARGIN, 0),
            REF_REGION[2] + DRIFT_SEARCH_MARGIN * 2,
            REF_REGION[3] + DRIFT_SEARCH_MARGIN * 2
        ];
        try {
            return !!findImage(img, referencePatch, { region: searchRegion, threshold: 0.85 });
        } catch (e) {
            log('[DriftGuard] 找图异常: ' + e);
            return true;
        }
    },
    refreshReference: function (img) {
        if (referencePatch) referencePatch.recycle();
        referencePatch = images.clip(img, REF_REGION[0], REF_REGION[1], REF_REGION[2], REF_REGION[3]);
        log('[DriftGuard] 参考图已刷新');
    },
    isWarehouseFull: function (img) {
        return isRegionUniform(img, CONFIG.warehouseFullCheckRegion, CONFIG.warehouseFullUniformTolerance);
    },
    crossCompare: function () {
        if (this.debugImgPaths.length < 2) return false;
        var firstPath = this.debugImgPaths[0];
        var lastPath = this.debugImgPaths[this.debugImgPaths.length - 1];
        var firstImg = null, lastImg = null, patch = null;
        var matched = false;
        try {
            firstImg = images.read(firstPath);
            lastImg = images.read(lastPath);
            if (!firstImg || !lastImg) {
                log('[DriftGuard] 交叉比对：读取截图失败');
                if (firstImg) firstImg.recycle();
                if (lastImg) lastImg.recycle();
                return false;
            }
            patch = images.clip(firstImg, REF_REGION[0], REF_REGION[1], REF_REGION[2], REF_REGION[3]);
            var searchRegion = [
                Math.max(REF_REGION[0] - DRIFT_SEARCH_MARGIN, 0),
                Math.max(REF_REGION[1] - DRIFT_SEARCH_MARGIN, 0),
                REF_REGION[2] + DRIFT_SEARCH_MARGIN * 2,
                REF_REGION[3] + DRIFT_SEARCH_MARGIN * 2
            ];
            matched = !!findImage(lastImg, patch, { region: searchRegion, threshold: 0.80 });
            log('[DriftGuard] 交叉比对: ' + (matched ? '匹配（画面未偏移，参考图老化）' : '不匹配'));
        } catch (e) {
            log('[DriftGuard] 交叉比对异常: ' + e);
        }
        if (patch) patch.recycle();
        if (firstImg) firstImg.recycle();
        if (lastImg) lastImg.recycle();
        return matched;
    },
    softCheck: function (stepName) {
        var img = safeCaptureScreen();
        if (!img) return 'ok';
        if (this.matchReference(img)) {
            this.refreshReference(img);
            img.recycle();
            return 'ok';
        }
        if (this.isWarehouseFull(img)) {
            log('[DriftGuard] softCheck: 参考图未命中但检测到纯色弹窗（可能爆仓）');
            this.saveDebugImg(img, 'soft_wfull_' + stepName);
            img.recycle();
            return 'warehouseFull';
        }
        this.suspected = true;
        this.suspectCheckpoint = stepName;
        this.saveDebugImg(img, '1_suspect_' + stepName);
        img.recycle();
        log('[DriftGuard] 【偏移嫌疑】' + stepName + ' 阶段参考图未命中，已记录截图');
        return 'suspected';
    },
    onBubblesFound: function (source) {
        if (this.suspected) {
            log('[DriftGuard] 【嫌疑解除】' + source + ' 检测到气泡，画面位置正确');
            this.suspected = false;
        }
    },
    // 嫌疑未解除时不再只打日志，升级为完整三图校验并把结果(ok/warehouseFull/drift)
    // 返回给调用方，调用方据此决定是否要触发挽救流程。
    midFlowRecheck: function () {
        if (!this.suspected) return 'ok';
        var img = safeCaptureScreen();
        if (!img) return 'ok';
        if (this.matchReference(img)) {
            log('[DriftGuard] 【嫌疑解除】中间补测参考图匹配成功');
            this.refreshReference(img);
            this.suspected = false;
            img.recycle();
            return 'ok';
        }
        this.saveDebugImg(img, '2_midcheck');
        img.recycle();
        log('[DriftGuard] 中间补测仍未命中，升级为完整三图校验确认');
        return this.finalCheck('midflow_escalate');
    },
    finalCheck: function (stepName) {
        var img = safeCaptureScreen();
        if (!img) return 'ok';
        if (this.matchReference(img)) {
            if (this.suspected) {
                log('[DriftGuard] 【嫌疑解除】最终校验第1次匹配成功，之前是误报');
            }
            this.refreshReference(img);
            this.suspected = false;
            img.recycle();
            return 'ok';
        }
        if (this.isWarehouseFull(img)) {
            this.saveDebugImg(img, '3_wfull_' + stepName);
            img.recycle();
            if (this.suspected) {
                log('[DriftGuard] 最终校验检测到纯色弹窗（仓库已满），之前的偏移嫌疑是弹窗导致');
                this.suspected = false;
            }
            return 'warehouseFull';
        }
        this.saveDebugImg(img, '3_check1_' + stepName);
        img.recycle();
        sleep(800); // 原子校验动作，不用 pausableSleep
        var img2 = safeCaptureScreen();
        if (img2) {
            if (this.matchReference(img2)) {
                log('[DriftGuard] 最终校验第2次匹配成功（瞬间遮挡已消除）');
                this.refreshReference(img2);
                this.suspected = false;
                img2.recycle();
                return 'ok';
            }
            if (this.isWarehouseFull(img2)) {
                this.saveDebugImg(img2, '3_wfull2_' + stepName);
                img2.recycle();
                log('[DriftGuard] 最终校验第2次检测到纯色弹窗（仓库已满）');
                this.suspected = false;
                return 'warehouseFull';
            }
            this.saveDebugImg(img2, '3_check2_' + stepName);
            img2.recycle();
        }
        sleep(500);
        var img3 = safeCaptureScreen();
        if (img3) {
            if (this.matchReference(img3)) {
                log('[DriftGuard] 最终校验第3次匹配成功');
                this.refreshReference(img3);
                this.suspected = false;
                img3.recycle();
                return 'ok';
            }
            if (this.isWarehouseFull(img3)) {
                this.saveDebugImg(img3, '3_wfull3_' + stepName);
                img3.recycle();
                log('[DriftGuard] 最终校验第3次检测到纯色弹窗（仓库已满）');
                this.suspected = false;
                return 'warehouseFull';
            }
            this.saveDebugImg(img3, '3_check3_' + stepName);
            img3.recycle();
        }
        if (this.crossCompare()) {
            log('[DriftGuard] 交叉比对证明画面未偏移，刷新参考图后继续');
            var refreshImg = safeCaptureScreen();
            if (refreshImg) {
                this.refreshReference(refreshImg);
                refreshImg.recycle();
            }
            this.suspected = false;
            return 'ok';
        }
        log('[DriftGuard] ===== 三图校验 + 交叉比对全部失败，确认画面偏移 (' + stepName + ') =====');
        log('[DriftGuard] 调试截图已保存到 ' + DEBUG_DIR + '，共 ' + this.debugImgPaths.length + ' 张:');
        for (var i = 0; i < this.debugImgPaths.length; i++) {
            log('[DriftGuard]   ' + this.debugImgPaths[i]);
        }
        log('[DriftGuard] 截屏统计: 总计=' + captureStats.total + ' 失败=' + captureStats.failed);
        return 'drift';
    }
};

// ================= 基础轨迹函数 =================
function generateLine(start, end, steps) {
    var pts = [];
    for (var i = 1; i <= steps; i++) {
        pts.push([
            Math.round(start[0] + (end[0] - start[0]) * (i / steps)),
            Math.round(start[1] + (end[1] - start[1]) * (i / steps)),
        ]);
    }
    return pts;
}
function circlePoints(center, radius, count) {
    var pts = [];
    for (var k = 0; k < count; k++) {
        var angle = (2 * Math.PI * k) / count;
        pts.push([
            Math.round(center[0] + radius * Math.cos(angle)),
            Math.round(center[1] + radius * Math.sin(angle)),
        ]);
    }
    return pts;
}
var BASE_STEPS = {
    entry: 15,
    l1_top: 40, l1_right: 20, l1_bottom: 40, l1_left: 20,
    l2_enter: 10, l2_top: 40, l2_right: 20, l2_bottom: 40,
    l3_close: 18, l3_enter: 8, l3_top: 22, l3_right: 10, l3_bottom: 22
};
function scaleSteps(base, ms) {
    return Math.max(2, Math.round(base * ms / 25));
}
function dist(a, b) {
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
function matchSteps(fromPt, toPt, nextSteps, nextDist) {
    var d = dist(fromPt, toPt);
    if (nextDist <= 0) return 2;
    return Math.max(2, Math.round(d * nextSteps / nextDist));
}
function dragFarmLoop(key) {
    var p = PARAMS[key];
    var points = [];
    var holdReps = Math.max(6, Math.round(CONFIG.holdMs / 60));
    for (var r = 0; r < holdReps; r++) points.push(p.icon);
    var warmupCircle = circlePoints(CONFIG.CENTER_TILE, 25, 10);
    points = points.concat(warmupCircle, warmupCircle, warmupCircle);
    for (var r2 = 0; r2 < 4; r2++) points.push(CONFIG.CENTER_TILE);
    var l1 = CONFIG.LEFT_X, r1 = CONFIG.RIGHT_X, t1 = p.topY, b1 = p.bottomY;
    var TL = [l1, t1], TR = [r1, t1], BR = [r1, b1], BL = [l1, b1];
    points = points.concat(generateLine(CONFIG.CENTER_TILE, TL, scaleSteps(BASE_STEPS.entry, p.loop1Ms)));
    points = points.concat(generateLine(TL, TR, scaleSteps(BASE_STEPS.l1_top, p.loop1Ms)));
    points = points.concat(generateLine(TR, BR, scaleSteps(BASE_STEPS.l1_right, p.loop1Ms)));
    points = points.concat(generateLine(BR, BL, scaleSteps(BASE_STEPS.l1_bottom, p.loop1Ms)));
    points = points.concat(generateLine(BL, TL, scaleSteps(BASE_STEPS.l1_left, p.loop1Ms)));
    var l2 = l1 + p.shrink, r2x = r1 - p.shrink, t2 = t1 + p.shrink, b2 = b1 - p.shrink;
    var TL2 = [l2, t2], TR2 = [r2x, t2], BR2 = [r2x, b2], BL2 = [l2, b2];
    var l2TopSteps = scaleSteps(BASE_STEPS.l2_top, p.loop2Ms);
    var l2TopDist = dist(TL2, TR2);
    points = points.concat(generateLine(TL, TL2, matchSteps(TL, TL2, l2TopSteps, l2TopDist)));
    points = points.concat(generateLine(TL2, TR2, l2TopSteps));
    points = points.concat(generateLine(TR2, BR2, scaleSteps(BASE_STEPS.l2_right, p.loop2Ms)));
    points = points.concat(generateLine(BR2, BL2, scaleSteps(BASE_STEPS.l2_bottom, p.loop2Ms)));
    var lastCorner = BL2;
    if (CONFIG.LOOP_COUNT >= 3) {
        points = points.concat(generateLine(BL2, TL2, scaleSteps(BASE_STEPS.l3_close, p.loop2Ms)));
        var l3 = l2 + p.shrink2, r3 = r2x - p.shrink2, t3 = t2 + p.shrink2, b3 = b2 - p.shrink2;
        var TL3 = [l3, t3], TR3 = [r3, t3], BR3 = [r3, b3], BL3 = [l3, b3];
        var l3TopSteps = scaleSteps(BASE_STEPS.l3_top, p.loop3Ms);
        var l3TopDist = dist(TL3, TR3);
        points = points.concat(generateLine(TL2, TL3, matchSteps(TL2, TL3, l3TopSteps, l3TopDist)));
        points = points.concat(generateLine(TL3, TR3, l3TopSteps));
        points = points.concat(generateLine(TR3, BR3, scaleSteps(BASE_STEPS.l3_right, p.loop3Ms)));
        points = points.concat(generateLine(BR3, BL3, scaleSteps(BASE_STEPS.l3_bottom, p.loop3Ms)));
        lastCorner = BL3;
    }
    points = points.concat(generateLine(lastCorner, p.hook1, 15));
    points = points.concat(generateLine(p.hook1, p.hook2, 15));
    points = points.concat(generateLine(p.hook2, CONFIG.CENTER_TILE, 15));
    var duration = Math.max(points.length * 25, 500);
    gesture.apply(null, [duration].concat(points));
}

// ================= 气泡检测 =================
function isBubblePresent(img, cx, cy) {
    var scanRadius = 55;
    var step = 10;
    var whiteCount = 0;
    var w = img.getWidth();
    var h = img.getHeight();
    for (var dx = -scanRadius; dx <= scanRadius; dx += step) {
        for (var dy = -scanRadius; dy <= scanRadius; dy += step) {
            var px = cx + dx;
            var py = cy + dy;
            if (px >= 0 && px < w && py >= 0 && py < h) {
                var c = images.pixel(img, px, py);
                if (colors.red(c) > 200 && colors.green(c) > 200 && colors.blue(c) > 180) {
                    whiteCount++;
                }
            }
        }
    }
    return whiteCount >= 8;
}

// ================= 饲料拖拽 =================
function pullFeed(x, y) {
    gesture(CONFIG.FEED_DRAG_MS, [x, y], [x, y + CONFIG.FEED_DRAG_DIST]);
}
function pullFeedSafe(x, y) {
    pullFeed(x, y);
    pausableSleep(200);
    click(CONFIG.factoryPopupSafeClick[0], CONFIG.factoryPopupSafeClick[1]);
    pausableSleep(200);
}

// ================= 鸡场 =================
function checkAndRunFarmTasks() {
    if (!PANEL.CHICKEN_ENABLED) return;
    pausableSleep(1000);
    var img = safeCaptureScreen();
    if (!img) return;
    var has_FT = isBubblePresent(img, CONFIG.bubble_FT[0], CONFIG.bubble_FT[1]);
    var has_FB = isBubblePresent(img, CONFIG.bubble_FB[0], CONFIG.bubble_FB[1]);
    var has_EL = isBubblePresent(img, CONFIG.bubble_EL[0], CONFIG.bubble_EL[1]);
    var has_ER = isBubblePresent(img, CONFIG.bubble_ER[0], CONFIG.bubble_ER[1]);
    img.recycle();
    log("鸡场气泡: FT=" + has_FT + " FB=" + has_FB + " EL=" + has_EL + " ER=" + has_ER);
    var fullChicken = has_FT && has_FB && has_EL && has_ER;
    var partialChicken = has_EL || has_ER;
    if (partialChicken || has_FT || has_FB) {
        DriftGuard.onBubblesFound('鸡场');
    }
    var shouldExecute = false;
    if (fullChicken) {
        shouldExecute = true;
        chickenPendingRound = false;
        toastLog("鸡场四气泡齐了，开始处理");
    } else if (partialChicken) {
        if (chickenPendingRound) {
            shouldExecute = true;
            chickenPendingRound = false;
            toastLog("鸡场气泡等一轮不齐，抢收");
        } else {
            chickenPendingRound = true;
            log("鸡场气泡不齐，等下一轮");
        }
    } else {
        chickenPendingRound = false;
    }
    if (shouldExecute) {
        if (has_FB) { click(CONFIG.bubble_FB[0], CONFIG.bubble_FB[1]); pausableSleep(400); }
        if (has_FT) { click(CONFIG.bubble_FT[0], CONFIG.bubble_FT[1]); pausableSleep(400); }
        if (has_EL) { click(CONFIG.bubble_EL[0], CONFIG.bubble_EL[1]); pausableSleep(400); }
        if (has_ER) { click(CONFIG.bubble_ER[0], CONFIG.bubble_ER[1]); pausableSleep(400); }
        pausableSleep(400);
        var SAFE = CONFIG.SAFE_CLOSE;
        var factX = CONFIG.factoryFeedIcon[0];
        var factY = CONFIG.factoryFeedIcon[1];
        click(CONFIG.build_FB[0], CONFIG.build_FB[1]); pausableSleep(1000);
        click(CONFIG.enter_FB[0], CONFIG.enter_FB[1]); pausableSleep(1500);
        for (var i = 0; i < PANEL.FACTORY_FEED_PULLS; i++) {
            pullFeedSafe(factX, factY);
        }
        click(SAFE[0], SAFE[1]); pausableSleep(1000);
        click(CONFIG.build_FT[0], CONFIG.build_FT[1]); pausableSleep(1000);
        click(CONFIG.enter_FT[0], CONFIG.enter_FT[1]); pausableSleep(1500);
        for (var i2 = 0; i2 < PANEL.FACTORY_FEED_PULLS; i2++) {
            pullFeedSafe(factX, factY);
        }
        click(SAFE[0], SAFE[1]); pausableSleep(1000);
        click(CONFIG.build_CL[0], CONFIG.build_CL[1]); pausableSleep(1000);
        click(CONFIG.enter_CL[0], CONFIG.enter_CL[1]); pausableSleep(1500);
        gesture(1500, CONFIG.coopFeedIcon, CONFIG.coopChicken1, CONFIG.coopChicken6);
        pausableSleep(200);
        click(CONFIG.coopPopupSafeClick[0], CONFIG.coopPopupSafeClick[1]);
        pausableSleep(400);
        click(SAFE[0], SAFE[1]); pausableSleep(1000);
        click(CONFIG.build_CR[0], CONFIG.build_CR[1]); pausableSleep(1000);
        click(CONFIG.enter_CR[0], CONFIG.enter_CR[1]); pausableSleep(1500);
        gesture(1500, CONFIG.coopFeedIcon, CONFIG.coopChicken1, CONFIG.coopChicken6);
        pausableSleep(200);
        click(CONFIG.coopPopupSafeClick[0], CONFIG.coopPopupSafeClick[1]);
        pausableSleep(400);
        click(SAFE[0], SAFE[1]); pausableSleep(1000);
        click(CONFIG.recenterTileAfterFarm[0], CONFIG.recenterTileAfterFarm[1]);
        pausableSleep(1000);
        needSellEggs = true;
        chickenCycleCount++;
        if (chickenCycleCount >= CONFIG.RICE_EVERY_N_CHICKEN_CYCLES) {
            riceQueued = true;
            chickenCycleCount = 0;
        }
    }
}

// ================= 马场 =================
function checkAndRunRanchTasks() {
    if (!PANEL.RANCH_ENABLED) return;
    pausableSleep(1000);
    var img = safeCaptureScreen();
    if (!img) return;
    var has_R1 = isBubblePresent(img, CONFIG.bubble_R1[0], CONFIG.bubble_R1[1]);
    var has_R2 = isBubblePresent(img, CONFIG.bubble_R2[0], CONFIG.bubble_R2[1]);
    img.recycle();
    log("马场气泡: R1=" + has_R1 + " R2=" + has_R2);
    if (has_R1 || has_R2) {
        DriftGuard.onBubblesFound('马场');
    }
    var fullRanch = has_R1 && has_R2;
    var partialRanch = has_R1 || has_R2;
    var shouldExecuteRanch = false;
    if (fullRanch) {
        shouldExecuteRanch = true;
        ranchPendingRound = false;
        toastLog("马场气泡齐了，开始处理");
    } else if (partialRanch) {
        if (ranchPendingRound) {
            shouldExecuteRanch = true;
            ranchPendingRound = false;
            toastLog("马场气泡等一轮不齐，抢收");
        } else {
            ranchPendingRound = true;
            log("马场气泡不齐，等下一轮");
        }
    } else {
        ranchPendingRound = false;
    }
    if (shouldExecuteRanch) {
        if (has_R1) { click(CONFIG.bubble_R1[0], CONFIG.bubble_R1[1]); pausableSleep(400); }
        if (has_R2) { click(CONFIG.bubble_R2[0], CONFIG.bubble_R2[1]); pausableSleep(400); }
        click(CONFIG.bubble_CHOP[0], CONFIG.bubble_CHOP[1]); pausableSleep(800);
        var SAFE = CONFIG.SAFE_CLOSE;
        pausableSleep(1000);
        click(CONFIG.build_R1[0], CONFIG.build_R1[1]); pausableSleep(1000);
        click(CONFIG.enter_R1[0], CONFIG.enter_R1[1]); pausableSleep(1500);
        gesture(1500, CONFIG.coopFeedIcon, CONFIG.coopChicken1, CONFIG.coopChicken6);
        pausableSleep(200);
        click(CONFIG.coopPopupSafeClick[0], CONFIG.coopPopupSafeClick[1]);
        pausableSleep(400);
        click(SAFE[0], SAFE[1]); pausableSleep(1000);
        click(CONFIG.build_R2[0], CONFIG.build_R2[1]); pausableSleep(1000);
        click(CONFIG.enter_R2[0], CONFIG.enter_R2[1]); pausableSleep(1500);
        gesture(1500, CONFIG.coopFeedIcon, CONFIG.coopChicken1, CONFIG.coopChicken6);
        pausableSleep(200);
        click(CONFIG.coopPopupSafeClick[0], CONFIG.coopPopupSafeClick[1]);
        pausableSleep(400);
        click(SAFE[0], SAFE[1]); pausableSleep(1000);
        pausableSleep(1000);
        click(CONFIG.build_CHOP[0], CONFIG.build_CHOP[1]); pausableSleep(1000);
        click(CONFIG.enter_CHOP[0], CONFIG.enter_CHOP[1]); pausableSleep(1500);
        for (var i = 0; i < PANEL.CHOP_FEED_PULLS; i++) {
            pullFeedSafe(CONFIG.chopFeedIcon[0], CONFIG.chopFeedIcon[1]);
        }
        click(SAFE[0], SAFE[1]); pausableSleep(1000);
        click(CONFIG.recenterTileAfterRanch[0], CONFIG.recenterTileAfterRanch[1]);
        pausableSleep(1000);
        needSellMilk = true;
    }
}

// ============================================================
// ============ 服务器卡死/画面偏移 自动重连恢复 (FreezeRecovery) ============
// ============================================================
CONFIG.exitGameBtn = [2222, 60];                          // 游戏内右上角固定退出按钮
CONFIG.mainLobbyCheckRegion = [1450, 60, 250, 90];        // 大厅顶部背景区域 (1450,60)-(1700,150)
CONFIG.mainLobbyUniformTolerance = 35;                    // 该区域不是精确纯色，容差放宽
CONFIG.mainLobbyRefColor = [86, 74, 48];                  // 实测色值
CONFIG.mainLobbyColorTolerance = 35;                      // 同样放宽一点容差
CONFIG.mainLobbyChangeThreshold = 40;                     // 还必须和"触发挽救那一刻"的底图相比有明显变化
CONFIG.disconnectDialogCheckRegion = [900, 300, 600, 100]; // 断线弹窗区域 (900,300)-(1500,400)
CONFIG.disconnectDialogUniformTolerance = 25;
CONFIG.disconnectDialogMinBrightness = 200;
CONFIG.disconnectDialogReconnectBtn = [1380, 670];        // 弹窗右边"重新连接"按钮：直接重连进游戏，跳过大厅画面
CONFIG.lobbyEnterListBtn = [1575, 666];                   // 大厅里点这里进入"进行中"列表（偏移场景走大厅时用）
CONFIG.lobbyEnterFarmBtn = [550, 550];                    // "进行中"列表里点"屯田"卡片进入农场
CONFIG.noticeBoardRecenterBtn = [1108, 1028];             // 布告栏图标：点一下把镜头固定拉回基准位置
CONFIG.sickleMenuRegion = [1100, 985, 240, 30];           // 与 hasMenuPopped 共用的底部种子/镰刀菜单突变检测区域
CONFIG.sickleMenuRegionTolerance = 15;
CONFIG.sickleStateRegion = [1160, 816, 120, 80];          // 镰刀图标附近区域：纯色命中=待收割；未命中=空地/杂色（需按实机截图校准）
CONFIG.sickleStateTolerance = 18;

function saveFreezeDebugImg(label) {
    try {
        var img = safeCaptureScreen();
        if (!img) return;
        var ts = new java.text.SimpleDateFormat('yyyyMMdd_HHmmss_SSS').format(new Date());
        images.save(img, DEBUG_DIR + ts + '_freeze_' + label + '.png');
        img.recycle();
    } catch (e) {
        log('保存卡死调试截图失败: ' + e);
    }
}

function captureRegionBaseline(region) {
    var img = safeCaptureScreen();
    if (!img) return null;
    var avg = regionAvgColor(img, region);
    img.recycle();
    return avg;
}

// 大厅检测：精确色值匹配(R:86,G:74,B:48，容差35) + 区域本身够均匀(容差35) +
// 和触发挽救那一刻的底图相比有明显变化，三个条件同时满足才算确认在大厅
function isAtMainLobby(img, baseline) {
    if (!isRegionUniform(img, CONFIG.mainLobbyCheckRegion, CONFIG.mainLobbyUniformTolerance)) return false;
    var avg = regionAvgColor(img, CONFIG.mainLobbyCheckRegion);
    var colorDiff = Math.max(
        Math.abs(avg[0] - CONFIG.mainLobbyRefColor[0]),
        Math.abs(avg[1] - CONFIG.mainLobbyRefColor[1]),
        Math.abs(avg[2] - CONFIG.mainLobbyRefColor[2])
    );
    if (colorDiff > CONFIG.mainLobbyColorTolerance) return false;
    if (baseline) {
        var changeDiff = Math.max(
            Math.abs(avg[0] - baseline[0]),
            Math.abs(avg[1] - baseline[1]),
            Math.abs(avg[2] - baseline[2])
        );
        if (changeDiff < CONFIG.mainLobbyChangeThreshold) return false;
    }
    return true;
}

function isDisconnectDialogShowing(img) {
    if (!isRegionUniform(img, CONFIG.disconnectDialogCheckRegion, CONFIG.disconnectDialogUniformTolerance)) return false;
    return regionAvgBrightness(img, CONFIG.disconnectDialogCheckRegion) >= CONFIG.disconnectDialogMinBrightness;
}

function checkMainLobbySolid(baseline) {
    var img = safeCaptureScreen();
    if (!img) return false;
    var result = isAtMainLobby(img, baseline);
    img.recycle();
    return result;
}

function randomDragScreen(durationMs) {
    var x1 = 500 + Math.floor(Math.random() * 1400);
    var y1 = 250 + Math.floor(Math.random() * 500);
    var dx = (Math.random() < 0.5 ? -1 : 1) * (300 + Math.floor(Math.random() * 400));
    var dy = (Math.random() < 0.5 ? -1 : 1) * (200 + Math.floor(Math.random() * 300));
    var x2 = Math.min(2350, Math.max(50, x1 + dx));
    var y2 = Math.min(1000, Math.max(150, y1 + dy));
    gesture(durationMs, [x1, y1], [x2, y2]);
}

function exitToLobbyForDrift(baseline) {
    log('[FreezeRecovery] (偏移) 开始点退出键，不设上限，直到确认回到大厅为止');
    var round = 0;
    while (true) {
        round++;
        renewLock();
        click(CONFIG.exitGameBtn[0], CONFIG.exitGameBtn[1]);
        sleepWithHeartbeat(10000);
        if (checkMainLobbySolid(baseline)) {
            log('[FreezeRecovery] (偏移) 第' + round + '次点退出后已确认回到大厅');
            return;
        }
        log('[FreezeRecovery] (偏移) 第' + round + '次点退出未生效（可能点到了建筑上，退出键没弹出），重试');
        if (round % 10 === 0) {
            toastLog('偏移恢复已尝试' + round + '次退出仍未成功，继续重试中…');
        }
    }
}

function reenterFarmFromLobby() {
    log('[FreezeRecovery] 从大厅重新进入农场');
    click(CONFIG.lobbyEnterListBtn[0], CONFIG.lobbyEnterListBtn[1]);
    sleepWithHeartbeat(10000);
    click(CONFIG.lobbyEnterFarmBtn[0], CONFIG.lobbyEnterFarmBtn[1]);
    sleepWithHeartbeat(10000);
}

function clickReconnectAndConfirm(baseline) {
    var round = 0;
    while (true) {
        round++;
        click(CONFIG.disconnectDialogReconnectBtn[0], CONFIG.disconnectDialogReconnectBtn[1]);
        sleepWithHeartbeat(10000);
        renewLock();

        var img = safeCaptureScreen();
        if (!img) {
            log('[FreezeRecovery] 重连后第' + round + '次截屏失败，继续重试点击重连');
            continue;
        }

        if (isDisconnectDialogShowing(img)) {
            img.recycle();
            log('[FreezeRecovery] 重连后第' + round + '次，断线弹窗纯色区域仍在，继续点重连');
            if (round % 5 === 0) {
                toastLog('重连按钮已点' + round + '次，弹窗仍未消失，继续重试中…');
            }
            continue;
        }

        var atLobby = isAtMainLobby(img, baseline);
        img.recycle();
        if (atLobby) {
            log('[FreezeRecovery] 重连后断线弹窗已消失，但检测到回到的是大厅而不是游戏内部，切换到"从大厅重新进入农场"流程');
            reenterFarmFromLobby();
        } else {
            log('[FreezeRecovery] 重连后断线弹窗已消失，且确认不在大厅，判定已回到游戏内部');
        }
        return;
    }
}

function recenterAndDetectState() {
    log('[FreezeRecovery] 点击布告栏回中按钮');
    click(CONFIG.noticeBoardRecenterBtn[0], CONFIG.noticeBoardRecenterBtn[1]);
    sleepWithHeartbeat(5000);

    var imgA = safeCaptureScreen();
    var patchA = null;
    if (imgA) {
        patchA = images.clip(imgA, REF_REGION[0], REF_REGION[1], REF_REGION[2], REF_REGION[3]);
        imgA.recycle();
    }

    click(CONFIG.SAFE_CLOSE[0], CONFIG.SAFE_CLOSE[1]);
    sleepWithHeartbeat(500);

    var imgBefore = safeCaptureScreen();
    var beforeSamples = imgBefore ? getRegionColorFingerprint(imgBefore) : null;
    if (imgBefore) imgBefore.recycle();

    click(CONFIG.CENTER_TILE[0], CONFIG.CENTER_TILE[1]); // ★ 全程唯一一次点中心地 ★

    var elapsed = 0;
    var popped = false;
    while (elapsed < 3000) {
        sleep(200);
        elapsed += 200;
        renewLock();
        var imgNow = safeCaptureScreen();
        if (imgNow) {
            if (beforeSamples) {
                var afterSamples = getRegionColorFingerprint(imgNow);
                var diffCount = 0;
                for (var i = 0; i < afterSamples.length; i++) {
                    var c1 = beforeSamples[i], c2 = afterSamples[i];
                    var diff = Math.max(
                        Math.abs(colors.red(c1) - colors.red(c2)),
                        Math.abs(colors.green(c1) - colors.green(c2)),
                        Math.abs(colors.blue(c1) - colors.blue(c2))
                    );
                    if (diff > 40) diffCount++;
                }
                if (diffCount > (afterSamples.length * 0.6)) popped = true;
            }
            if (popped) { imgNow.recycle(); break; }
            imgNow.recycle();
        }
    }

    if (!popped) {
        log('[FreezeRecovery] 回中后唯一一次点击中心地，3秒内未检测到菜单弹出（疑似点空），退回兜底路径');
        click(CONFIG.SAFE_CLOSE[0], CONFIG.SAFE_CLOSE[1]);
        sleepWithHeartbeat(500);
        refreshDriftReference();
        return { mode: 'harvest', menuAlreadyOpen: false };
    }

    sleep(350); // 等动画定型，和 clickAndAwaitMenu 里的处理完全一致
    var imgB = safeCaptureScreen();
    var sickleReady = true;
    var recentered = false;
    if (imgB) {
        sickleReady = isRegionUniform(imgB, CONFIG.sickleStateRegion, CONFIG.sickleStateTolerance);
        if (patchA) {
            try {
                var searchRegion = [
                    Math.max(REF_REGION[0] - DRIFT_SEARCH_MARGIN, 0),
                    Math.max(REF_REGION[1] - DRIFT_SEARCH_MARGIN, 0),
                    REF_REGION[2] + DRIFT_SEARCH_MARGIN * 2,
                    REF_REGION[3] + DRIFT_SEARCH_MARGIN * 2
                ];
                recentered = !!findImage(imgB, patchA, { region: searchRegion, threshold: 0.85 });
            } catch (e) {
                log('[FreezeRecovery] 回中比对异常: ' + e);
            }
        }
        DriftGuard.refreshReference(imgB);
        try {
            var ts = new java.text.SimpleDateFormat('yyyyMMdd_HHmmss_SSS').format(new Date());
            images.save(imgB, DEBUG_DIR + ts + '_freeze_recenter_state_' + (sickleReady ? 'sickle' : 'notsickle') + '.png');
        } catch (e) { log('[FreezeRecovery] 保存回中调试截图失败: ' + e); }
        imgB.recycle();
    }
    if (patchA) patchA.recycle();

    log(recentered
        ? '[FreezeRecovery] 回中确认成功（回中前后两次截图的参考区域一致）'
        : '[FreezeRecovery] 回中比对未能确认一致，已用最新截图刷新参考图，继续后续流程');
    log('[FreezeRecovery] 回中完成，菜单已打开，统一接收割流程');
    return { mode: 'harvest', menuAlreadyOpen: true };

function handleFreezeRecovery(baseline) {
    log('[FreezeRecovery] (卡死) Phase1开始：最多3轮"拖屏+点退出"，每轮结束后检测大厅/断线弹窗/偏移');
    for (var i = 1; i <= 3; i++) {
        randomDragScreen(300);
        sleepWithHeartbeat(1000);
        click(CONFIG.exitGameBtn[0], CONFIG.exitGameBtn[1]);
        sleepWithHeartbeat(10000);

        var img = safeCaptureScreen();
        if (!img) {
            log('[FreezeRecovery] (卡死) Phase1第' + i + '轮：截屏失败，跳过本轮判断');
            continue;
        }

        if (isAtMainLobby(img, baseline)) {
            img.recycle();
            log('[FreezeRecovery] (卡死) Phase1第' + i + '轮：已确认回到大厅（拖屏或退出键生效）');
            reenterFarmFromLobby();
            return recenterAndDetectState();
        }

        if (isDisconnectDialogShowing(img)) {
            img.recycle();
            log('[FreezeRecovery] (卡死) Phase1第' + i + '轮：检测到断线弹窗，点击重新连接(' + CONFIG.disconnectDialogReconnectBtn[0] + ',' + CONFIG.disconnectDialogReconnectBtn[1] + ')');
            clickReconnectAndConfirm(baseline);
            return recenterAndDetectState();
        }

        var stillMatchesRef = DriftGuard.matchReference(img);
        img.recycle();
        if (!stillMatchesRef) {
            log('[FreezeRecovery] (卡死) Phase1第' + i + '轮：拖屏导致画面偏移（不再是原地卡死），切换到偏移恢复流程（不设上限，直到退出成功）');
            saveFreezeDebugImg('phase1_drift_round' + i);
            exitToLobbyForDrift(baseline);
            reenterFarmFromLobby();
            return recenterAndDetectState();
        }

        log('[FreezeRecovery] (卡死) Phase1第' + i + '轮：画面仍与卡死时一致，未回到大厅也未见弹窗，继续下一轮');
    }

    log('[FreezeRecovery] (卡死) Phase1三轮均未解决，停止一切主动拖屏/点击操作，进入Phase2：每60秒被动检测一次断线弹窗，不设轮数上限');
    var waitRound = 0;
    while (true) {
        sleepWithHeartbeat(60000);
        waitRound++;
        renewLock();
        saveFreezeDebugImg('phase2_round' + waitRound);

        var img2 = safeCaptureScreen();
        if (!img2) {
            log('[FreezeRecovery] (卡死) Phase2第' + waitRound + '轮：截屏失败，继续等待');
            continue;
        }

        if (isDisconnectDialogShowing(img2)) {
            img2.recycle();
            log('[FreezeRecovery] (卡死) Phase2第' + waitRound + '轮：检测到断线弹窗！点击重新连接');
            clickReconnectAndConfirm(baseline);
            return recenterAndDetectState();
        }

        if (isAtMainLobby(img2, baseline)) {
            img2.recycle();
            log('[FreezeRecovery] (卡死) Phase2第' + waitRound + '轮：意外检测到已经在大厅（可能系统自动弹回），重新进入农场');
            reenterFarmFromLobby();
            return recenterAndDetectState();
        }

        img2.recycle();
        log('[FreezeRecovery] (卡死) Phase2第' + waitRound + '轮：断线弹窗仍未出现，继续被动等待（不主动操作屏幕）');
    }
}

// 恢复总入口。
// kind: 'freeze' 走"卡死"专用流程(Phase1+Phase2)；'drift' 走"偏移"专用流程
// （不设上限一直点退出键）。恢复完成后返回 { mode, menuAlreadyOpen }，
// 交由调用方通过 RecoveredCycleSignal 带回主循环。
function recoverFromFreeze(reasonLabel, kind) {
    toastLog('触发自动重连恢复（' + reasonLabel + '），请勿手动操作手机');
    log('[FreezeRecovery] ===== 开始恢复流程，原因: ' + reasonLabel + '（类型: ' + kind + '）=====');
    saveFreezeDebugImg(kind + '_start');
    var baseline = captureRegionBaseline(CONFIG.mainLobbyCheckRegion);

    var detectionResult;
    if (kind === 'drift') {
        exitToLobbyForDrift(baseline);
        reenterFarmFromLobby();
        detectionResult = recenterAndDetectState();
    } else {
        detectionResult = handleFreezeRecovery(baseline);
    }

    log('[FreezeRecovery] ===== 恢复流程完成，续接: ' + detectionResult.mode +
        '（菜单' + (detectionResult.menuAlreadyOpen ? '已打开，将直接复用' : '未打开，将由harvestAll/plantAll自己重新点开') + '） =====');
    toastLog('已重连并回正，继续' + (detectionResult.mode === 'harvest' ? '收割' : '种植'));
    return detectionResult;
}

// ================= 菜单区域检测逻辑 (区域突变检测 + 350ms防脱手缓冲 + 点空自动重试) =================
var menuRefColors = null;

function getRegionColorFingerprint(img) {
    return sampleRegionColors(img, CONFIG.sickleMenuRegion, 40, 10);
}

function hasMenuPopped(img) {
    if (!menuRefColors) return false;
    var currentSamples = sampleRegionColors(img, CONFIG.sickleMenuRegion, 40, 10);
    var diffCount = 0;
    for (var i = 0; i < currentSamples.length; i++) {
        var c1 = menuRefColors[i];
        var c2 = currentSamples[i];
        var diff = Math.max(Math.abs(colors.red(c1) - colors.red(c2)), 
                            Math.abs(colors.green(c1) - colors.green(c2)), 
                            Math.abs(colors.blue(c1) - colors.blue(c2)));
        if (diff > 40) diffCount++; 
    }
    return diffCount > (currentSamples.length * 0.6);
}

function saveMenuMissDebugImg(label) {
    try {
        var img = safeCaptureScreen();
        if (!img) return;
        var ts = new java.text.SimpleDateFormat('yyyyMMdd_HHmmss_SSS').format(new Date());
        images.save(img, DEBUG_DIR + ts + '_menumiss_' + label + '.png');
        img.recycle();
    } catch (e) {
        log('保存点空调试截图失败: ' + e);
    }
}

// 只保留原坐标重试5次（上下偏移坐标实测基本无效，已去掉）。5次都不中的话，
// 判定为服务器卡死，交给自动重连恢复流程（'freeze' 类型）。
// ★ 内部全部用 sleep 而不是 pausableSleep：这是一段"点击->等菜单弹出->350ms
// 定型"的原子操作，中途被暂停信号打断会导致状态不完整，所以这里故意不响应
// 暂停（最坏情况下暂停按钮会有几秒到十几秒延迟才生效，换来的是这段动作不会
// 被腰斩）。
var CENTER_CLICK_RETRY_COUNT = 5;

function clickAndAwaitMenu(clickX, clickY, stepLabel) {
    for (var attempt = 1; attempt <= CENTER_CLICK_RETRY_COUNT; attempt++) {
        if (attempt > 1) {
            click(CONFIG.SAFE_CLOSE[0], CONFIG.SAFE_CLOSE[1]);
            sleep(300);
        }
        var imgRef = safeCaptureScreen();
        if (imgRef) {
            menuRefColors = getRegionColorFingerprint(imgRef);
            imgRef.recycle();
        }
        click(clickX, clickY);
        var elapsed = 0;
        var popped = false;
        while (elapsed < 3000) {
            sleep(200);
            elapsed += 200;
            renewLock();
            var imgNow = safeCaptureScreen();
            if (imgNow) {
                if (hasMenuPopped(imgNow)) {
                    imgNow.recycle();
                    popped = true;
                    break;
                }
                imgNow.recycle();
            }
        }
        if (popped) {
            sleep(350);
            if (attempt > 1) {
                log('[clickAndAwaitMenu] ' + (stepLabel || '') + ' 第' + attempt + '次点击后菜单成功弹出，继续流程');
            }
            return true;
        }
        log('[clickAndAwaitMenu] ' + (stepLabel || '') + ' 第' + attempt + '次点击后3秒内未检测到菜单弹出（疑似点空/被吞），准备重试');
    }

    log('[clickAndAwaitMenu] ' + (stepLabel || '') + ' 原坐标连续' + CENTER_CLICK_RETRY_COUNT + '次点击均未能弹出菜单');
    var imgCheck = safeCaptureScreen();
    var stillCentered = true;
    if (imgCheck) {
        stillCentered = DriftGuard.matchReference(imgCheck);
        imgCheck.recycle();
    }
    log(stillCentered
        ? '[clickAndAwaitMenu] 屋顶参考图仍匹配，画面未偏移——判定为服务器/客户端卡死'
        : '[clickAndAwaitMenu] 屋顶参考图未匹配，不排除同时存在画面偏移，统一交给挽救流程处理');
    saveMenuMissDebugImg((stepLabel || 'tap') + '_freeze');
    toastLog('中心地菜单连续' + CENTER_CLICK_RETRY_COUNT + '次未弹出，判定服务器卡死，自动重连恢复中…');

    var result = recoverFromFreeze(stepLabel + '-菜单未弹出(疑似卡死)', 'freeze');
    throw new RecoveredCycleSignal(result.mode, result.menuAlreadyOpen);
}

// ================= 四个主阶段 =================
function plantAll(menuAlreadyOpen) {
    CTRL.currentPhase = 'plant';
    var useRice = riceQueued;
    riceQueued = false;
    lastPlantTime = Date.now();

    if (!menuAlreadyOpen) {
        clickAndAwaitMenu(CONFIG.targetTile[0], CONFIG.targetTile[1], 'plant');
    } else {
        log('[plantAll] 菜单已由挽救流程回中时打开，直接复用，不再重复点击中心地');
    }

    if (useRice) {
        toastLog("== 播种水稻 ==");
        dragFarmLoop("rice");
        isRiceRound = true;
    } else {
        toastLog("== 播种小麦 ==");
        dragFarmLoop("wheat");
        isRiceRound = false;
    }
    pausableSleep(500);
    var driftResult = DriftGuard.softCheck('plant');
    if (driftResult === 'warehouseFull') {
        log('种植阶段检测到仓库已满弹窗，进入挽救流程');
        handleWarehouseFullDuringHarvest();
    } else if (driftResult === 'suspected') {
        log('[plantAll] softCheck 报偏移嫌疑，等1秒后立即做完整三图校验确认');
        pausableSleep(1000);
        var confirmResult = DriftGuard.finalCheck('plant_immediate');
        if (confirmResult === 'drift') {
            toastLog('种植后立即确认画面偏移，自动重连恢复中…');
            log('[plantAll] ===== 种植后偏移确认，触发挽救流程 =====');
            var result = recoverFromFreeze('plant种植后立即确认偏移', 'drift');
            throw new RecoveredCycleSignal(result.mode, result.menuAlreadyOpen);
        } else if (confirmResult === 'warehouseFull') {
            handleWarehouseFullDuringHarvest();
        } else {
            log('[plantAll] 三图校验未确认偏移（误报），继续正常流程');
        }
    }
}

function sellCropsAndEggs() {
    if (skipNextSell) {
        skipNextSell = false;
        log('上一轮爆仓挽救已卖过，跳过本轮卖货');
        return;
    }
    click(CONFIG.warehouseBtn[0], CONFIG.warehouseBtn[1]);
    pausableSleep(2000);
    click(CONFIG.warehouseConfirmBtn[0], CONFIG.warehouseConfirmBtn[1]);
    pausableSleep(800);
    if (lastHarvestWasRice === true) {
        click(CONFIG.riceSlotInWarehouse[0], CONFIG.riceSlotInWarehouse[1]);
        pausableSleep(500);
        click(CONFIG.riceSellBtn[0], CONFIG.riceSellBtn[1]);
        pausableSleep(500);
    } else if (lastHarvestWasRice === false) {
        for (var i = 0; i < 2; i++) {
            click(CONFIG.wheatSlotInWarehouse[0], CONFIG.wheatSlotInWarehouse[1]);
            pausableSleep(500);
            click(CONFIG.sellBtn[0], CONFIG.sellBtn[1]);
            pausableSleep(500);
        }
    } else {
        for (var i0 = 0; i0 < 2; i0++) {
            click(CONFIG.wheatSlotInWarehouse[0], CONFIG.wheatSlotInWarehouse[1]);
            pausableSleep(500);
            click(CONFIG.sellBtn[0], CONFIG.sellBtn[1]);
            pausableSleep(500);
        }
    }
    if (needSellEggs && CONFIG.eggSlotInWarehouse && CONFIG.eggSellBtn) {
        click(CONFIG.eggSlotInWarehouse[0], CONFIG.eggSlotInWarehouse[1]);
        pausableSleep(500);
        click(CONFIG.eggSellBtn[0], CONFIG.eggSellBtn[1]);
        pausableSleep(500);
        needSellEggs = false;
    }
    if (needSellMilk && CONFIG.milkSlotInWarehouse && CONFIG.milkSellBtn) {
        click(CONFIG.milkSlotInWarehouse[0], CONFIG.milkSlotInWarehouse[1]);
        pausableSleep(500);
        click(CONFIG.milkSellBtn[0], CONFIG.milkSellBtn[1]);
        pausableSleep(500);
        needSellMilk = false;
    }
    click(CONFIG.SAFE_CLOSE[0], CONFIG.SAFE_CLOSE[1]);
    pausableSleep(500);
    click(CONFIG.returnToFieldBtn[0], CONFIG.returnToFieldBtn[1]);
    pausableSleep(1500);
}

function waitUntilFree() {
    var waitSeconds = computeWaitSeconds(isRiceRound);
    var targetMs = waitSeconds * 1000 + CONFIG.freeWaitBufferMs;
    var elapsedMs = Date.now() - lastPlantTime;
    var remainMs = targetMs - elapsedMs;
    setActionInProgress(false);
    if (remainMs > 0) pausableSleep(remainMs);
    if (CTRL.settingsOpen) {
        forceCloseSettingsPanel();
        CTRL.paused = true;
        if (ctrlWin) ctrlWin.ppBtn.post(function () { ctrlWin.ppBtn.setText(" ▶ "); });
        toastLog("动作即将开始，设置未关闭，已自动暂停");
        setActionInProgress(true);
        throw new PauseSignal();
    }
    setActionInProgress(true);
    click(CONFIG.targetTile[0], CONFIG.targetTile[1]);
    sleep(600);
    click(CONFIG.freeButtonPos[0], CONFIG.freeButtonPos[1]);
    sleep(500);
}

function handleWarehouseFullDuringHarvest() {
    click(CONFIG.warehouseFullCloseBtn[0], CONFIG.warehouseFullCloseBtn[1]);
    pausableSleep(800);
    click(CONFIG.warehouseBtn[0], CONFIG.warehouseBtn[1]);
    pausableSleep(2000);
    click(CONFIG.warehouseConfirmBtn[0], CONFIG.warehouseConfirmBtn[1]);
    pausableSleep(800);
    for (var i = 0; i < 2; i++) {
        click(CONFIG.wheatSlotInWarehouse[0], CONFIG.wheatSlotInWarehouse[1]);
        pausableSleep(500);
        click(CONFIG.sellBtn[0], CONFIG.sellBtn[1]);
        pausableSleep(500);
    }
    click(CONFIG.riceSlotInWarehouse[0], CONFIG.riceSlotInWarehouse[1]);
    pausableSleep(500);
    click(CONFIG.riceSellBtn[0], CONFIG.riceSellBtn[1]);
    pausableSleep(500);
    if (PANEL.CHICKEN_ENABLED && CONFIG.eggSlotInWarehouse && CONFIG.eggSellBtn) {
        click(CONFIG.eggSlotInWarehouse[0], CONFIG.eggSlotInWarehouse[1]);
        pausableSleep(500);
        click(CONFIG.eggSellBtn[0], CONFIG.eggSellBtn[1]);
        pausableSleep(500);
        needSellEggs = false;
    }
    if (PANEL.RANCH_ENABLED && CONFIG.milkSlotInWarehouse && CONFIG.milkSellBtn) {
        click(CONFIG.milkSlotInWarehouse[0], CONFIG.milkSlotInWarehouse[1]);
        pausableSleep(500);
        click(CONFIG.milkSellBtn[0], CONFIG.milkSellBtn[1]);
        pausableSleep(500);
        needSellMilk = false;
    }
    click(CONFIG.SAFE_CLOSE[0], CONFIG.SAFE_CLOSE[1]);
    pausableSleep(500);
    click(CONFIG.returnToFieldBtn[0], CONFIG.returnToFieldBtn[1]);
    pausableSleep(1500);
    skipNextSell = true;
    bubbleDetectSuspended = true;
    log('仓库已满挽救流程完成，已标记暂停气泡检测直到下次收割干净');
}

// menuAlreadyOpen=true 时跳过 clickAndAwaitMenu()，直接复用挽救流程回中时
// 已经打开的菜单继续走拖拽，避免同一块熟地被连续点两次导致提前收掉一格。
// 默认 false，行为和以前完全一样。
function harvestAll(menuAlreadyOpen) {
    CTRL.currentPhase = 'harvest';
    lastHarvestWasRice = isRiceRound;

    if (!menuAlreadyOpen) {
        clickAndAwaitMenu(CONFIG.targetTile[0], CONFIG.targetTile[1], 'harvest');
    } else {
        log('[harvestAll] 菜单已由挽救流程回中时打开，直接复用，不再重复点击中心地');
    }

    dragFarmLoop(isRiceRound ? "riceSickle" : "sickle");
    pausableSleep(500);
    var result = DriftGuard.finalCheck('harvest');
    if (result === 'ok') {
        consecutiveWarehouseFullRecoveries = 0;
        if (bubbleDetectSuspended) {
            bubbleDetectSuspended = false;
            log('本轮收割完整完成，未再次爆仓，下一轮恢复鸡场/马场气泡检测');
        }
        return;
    }
    if (result === 'warehouseFull') {
        consecutiveWarehouseFullRecoveries++;
        if (consecutiveWarehouseFullRecoveries > MAX_CONSECUTIVE_WAREHOUSE_FULL_RECOVERIES) {
            toastLog('仓库已满挽救连续触发太多次，脚本停止');
            releaseLock(); exit();
        }
        toastLog('仓库已满弹窗，自动挽救 (第' + consecutiveWarehouseFullRecoveries + '次)');
        handleWarehouseFullDuringHarvest();
        return;
    }
    toastLog('三图校验+交叉比对确认画面偏移，自动重连恢复中（不再停止脚本）…');
    log('[harvestAll] 确认画面偏移，触发挽救流程');
    var result2 = recoverFromFreeze('harvest收割后三图校验确认偏移', 'drift');
    throw new RecoveredCycleSignal(result2.mode, result2.menuAlreadyOpen);
}

// ================= 暂停恢复处理 =================
// 手动暂停恢复（悬浮窗按钮那一套）完全不受自动挽救流程影响，原样保留。
function handlePauseAndResume() {
    setActionInProgress(false);
    log('[暂停] 阶段=' + CTRL.currentPhase + '，等待用户通过播放键选择继续时的动作（种植/收割/取消）');
    while (CTRL.paused) {
        sleep(200);
        renewLock();
    }
    setActionInProgress(true);
    var choice = pendingResumeChoice;
    pendingResumeChoice = null;
    try {
        if (choice === 'harvest') {
            toastLog('10秒后开始收割，请确保下方镰刀图标已出现');
            log('[恢复] 用户选择"收割"，等待10秒后直接收割');
            pausableSleep(10000);
            refreshDriftReference();
            skipNextSell = false;
            skipToHarvestOnce = true;
        } else {
            toastLog('10秒后开始种植，请确保已回到中心基准地');
            log('[恢复] 用户选择"种植"，等待10秒后从基准地开始完整流程');
            pausableSleep(10000);
            refreshDriftReference();
            skipToHarvestOnce = false;
        }
    } catch (e2) {
        if (e2 instanceof PauseSignal) {
            handlePauseAndResume();
        } else {
            throw e2;
        }
    }
}
// ================= 坐标校准（悬浮窗拖拽） =================
function waitForLandscape() {
    if (device.width < device.height) {
        toastLog("请切回游戏，保持横屏");
        while (device.width < device.height) {
            sleep(500);
        }
        sleep(1500);
    }
}
function calibratePoint(promptText) {
    waitForLandscape();
    sleep(300);
    var realW = device.width;
    var realH = device.height;
    var marker = floaty.window(
        <frame id="root" gravity="center" w="80" h="80" bg="#00000000">
            <text text="✛" textSize="45sp" textColor="#ff0000" gravity="center"/>
        </frame>
    );
    marker.setPosition(realW / 2 - 40, realH / 2 - 40);
    var confirmWin = floaty.window(
        <frame gravity="center" bg="#88000000">
            <button id="btn" text="确定这里" textSize="16sp" w="160" h="70"/>
        </frame>
    );
    confirmWin.setPosition(40, 200);
    toastLog(promptText);
    var sx, sy, srx, sry;
    var absoluteX = realW / 2;
    var absoluteY = realH / 2;
    marker.root.setOnTouchListener(function (view, event) {
        switch (event.getAction()) {
            case event.ACTION_DOWN:
                sx = marker.getX(); sy = marker.getY();
                srx = event.getRawX(); sry = event.getRawY();
                break;
            case event.ACTION_MOVE:
                marker.setPosition(
                    sx + (event.getRawX() - srx),
                    sy + (event.getRawY() - sry)
                );
                break;
            case event.ACTION_UP:
                absoluteX = event.getRawX() - event.getX() + view.getWidth() / 2;
                absoluteY = event.getRawY() - event.getY() + view.getHeight() / 2;
                break;
        }
        return true;
    });
    var result = null;
    confirmWin.btn.click(function () {
        var screenW = Math.max(device.width, device.height);
        var screenH = Math.min(device.width, device.height);
        var designX = Math.round((absoluteX / screenW) * 2412);
        var designY = Math.round((absoluteY / screenH) * 1080);
        result = [designX, designY];
    });
    while (result == null) sleep(200);
    marker.close();
    confirmWin.close();
    sleep(300);
    return result;
}
function calibrateAndVerify(promptText) {
    while (true) {
        var pos = calibratePoint(promptText);
        sleep(1000);
        click(pos[0], pos[1]);
        sleep(1000);
        var ok = dialogs.confirm(
            "刚才自动点的位置准不准？\n不准的话重新拖一次准星，可以故意往偏差的反方向挪一点来纠正。",
            "核对坐标：" + pos[0] + "," + pos[1]
        );
        if (ok) return pos;
        toastLog("重新校准这个点");
    }
}
// ================= 悬浮控制面板 UI 辅助 =================
function setToggleOn(view) {
    view.post(function () {
        view.setText(" 开 ");
        try { view.setBackgroundColor(colors.parseColor("#4CAF50")); } catch (e) {}
    });
}
function setToggleOff(view) {
    view.post(function () {
        view.setText(" 关 ");
        try { view.setBackgroundColor(colors.parseColor("#666666")); } catch (e) {}
    });
}
function setRowVisible(view, visible) {
    view.post(function () { view.setVisibility(visible ? 0 : 8); });
}
function forceCloseSettingsPanel() {
    CTRL.settingsOpen = false;
    if (ctrlWin) {
        ctrlWin.panel.post(function () { ctrlWin.panel.setVisibility(8); });
    }
}
function syncSettingsPanelToState() {
    if (potionActive) {
        setToggleOn(ctrlWin.potionTgl);
        var remainH = Math.max(1, Math.round(potionHours - (Date.now() - potionStartTime) / 3600000));
        ctrlWin.pHours.post(function () { ctrlWin.pHours.setText("" + remainH); });
        setRowVisible(ctrlWin.potionDurRow, true);
    } else {
        setToggleOff(ctrlWin.potionTgl);
        setRowVisible(ctrlWin.potionDurRow, false);
    }
    if (PANEL.CHICKEN_ENABLED) {
        setToggleOn(ctrlWin.chickenTgl);
        ctrlWin.cp1Val.post(function () { ctrlWin.cp1Val.setText("" + PANEL.FACTORY_FEED_PULLS); });
        ctrlWin.cp2Val.post(function () { ctrlWin.cp2Val.setText("" + PANEL.RICE_EVERY_N_CHICKEN); });
        setRowVisible(ctrlWin.cp1Row, true);
        setRowVisible(ctrlWin.cp2Row, true);
    } else {
        setToggleOff(ctrlWin.chickenTgl);
        setRowVisible(ctrlWin.cp1Row, false);
        setRowVisible(ctrlWin.cp2Row, false);
    }
    if (PANEL.RANCH_ENABLED) {
        setToggleOn(ctrlWin.ranchTgl);
        ctrlWin.rp1Val.post(function () { ctrlWin.rp1Val.setText("" + PANEL.CHOP_FEED_PULLS); });
        setRowVisible(ctrlWin.rp1Row, true);
    } else {
        setToggleOff(ctrlWin.ranchTgl);
        setRowVisible(ctrlWin.rp1Row, false);
    }
}
function showResumeChoiceDialog() {
    var actionClicked = null;
    var dlg = dialogs.build({
        title: "继续后，下一步做什么？",
        content: "请选择恢复后要执行的动作，选“取消”则保持暂停",
        positive: "种植",
        negative: "收割",
        neutral: "取消"
    }).on("any", function (action, dialog) {
        actionClicked = action;
    });
    dlg.show();
    while (actionClicked == null) sleep(100);
    if (actionClicked !== "positive" && actionClicked !== "negative") {
        return;
    }
    pendingResumeChoice = (actionClicked === "positive") ? "plant" : "harvest";
    CTRL.paused = false;
    ctrlWin.ppBtn.post(function () { ctrlWin.ppBtn.setText(" ⏸ "); });
}
function createControlPanel() {
    ctrlWin = floaty.window(
        <vertical id="root" w="auto" h="auto">
            <horizontal id="bar" bg="#CC333333" w="auto" h="36" gravity="center_vertical" padding="2">
                <text id="drag" text=" ≡ " textColor="#999999" textSize="15sp" w="30" h="36" gravity="center"/>
                <frame w="1" h="22" bg="#555555"/>
                <text id="setBtn" text=" ⚙ " textColor="#555555" textSize="16sp" w="36" h="36" gravity="center"/>
                <frame w="1" h="22" bg="#555555"/>
                <text id="ppBtn" text=" ⏸ " textColor="#CCCCCC" textSize="16sp" w="36" h="36" gravity="center"/>
            </horizontal>
            <vertical id="panel" bg="#EE333333" w="230" padding="8" visibility="gone">
                <horizontal w="match_parent" h="30" gravity="center_vertical">
                    <text text="加速酒" textColor="#E0E0E0" textSize="12sp" w="0" layout_weight="1" gravity="left|center_vertical"/>
                    <text id="potionTgl" text=" 关 " textColor="#FFFFFF" textSize="11sp" bg="#666666" padding="8" gravity="center"/>
                </horizontal>
                <horizontal id="potionDurRow" w="match_parent" h="28" gravity="center_vertical" visibility="gone">
                    <text text="  时长(h)" textColor="#AAAAAA" textSize="11sp" w="0" layout_weight="1" gravity="left|center_vertical"/>
                    <text id="pMinus" text=" − " textColor="#FFFFFF" textSize="13sp" bg="#44FFFFFF" padding="6" gravity="center"/>
                    <text id="pHours" text="6" textColor="#FFFFFF" textSize="13sp" w="28" gravity="center"/>
                    <text id="pPlus" text=" + " textColor="#FFFFFF" textSize="13sp" bg="#44FFFFFF" padding="6" gravity="center"/>
                </horizontal>
                <horizontal w="match_parent" h="30" gravity="center_vertical" marginTop="3">
                    <text text="鸡场" textColor="#E0E0E0" textSize="12sp" w="0" layout_weight="1" gravity="left|center_vertical"/>
                    <text id="chickenTgl" text=" 关 " textColor="#FFFFFF" textSize="11sp" bg="#666666" padding="8" gravity="center"/>
                </horizontal>
                <horizontal id="cp1Row" w="match_parent" h="26" gravity="center_vertical" visibility="gone">
                    <text text="  铡刀拖拽" textColor="#AAAAAA" textSize="11sp" w="0" layout_weight="1" gravity="left|center_vertical"/>
                    <text id="cp1Minus" text=" − " textColor="#FFFFFF" textSize="12sp" bg="#44FFFFFF" padding="5" gravity="center"/>
                    <text id="cp1Val" text="3" textColor="#FFFFFF" textSize="12sp" w="24" gravity="center"/>
                    <text id="cp1Plus" text=" + " textColor="#FFFFFF" textSize="12sp" bg="#44FFFFFF" padding="5" gravity="center"/>
                </horizontal>
                <horizontal id="cp2Row" w="match_parent" h="26" gravity="center_vertical" visibility="gone">
                    <text text="  水稻轮距" textColor="#AAAAAA" textSize="11sp" w="0" layout_weight="1" gravity="left|center_vertical"/>
                    <text id="cp2Minus" text=" − " textColor="#FFFFFF" textSize="12sp" bg="#44FFFFFF" padding="5" gravity="center"/>
                    <text id="cp2Val" text="4" textColor="#FFFFFF" textSize="12sp" w="24" gravity="center"/>
                    <text id="cp2Plus" text=" + " textColor="#FFFFFF" textSize="12sp" bg="#44FFFFFF" padding="5" gravity="center"/>
                </horizontal>
                <horizontal w="match_parent" h="30" gravity="center_vertical" marginTop="3">
                    <text text="马场" textColor="#E0E0E0" textSize="12sp" w="0" layout_weight="1" gravity="left|center_vertical"/>
                    <text id="ranchTgl" text=" 关 " textColor="#FFFFFF" textSize="11sp" bg="#666666" padding="8" gravity="center"/>
                </horizontal>
                <horizontal id="rp1Row" w="match_parent" h="26" gravity="center_vertical" visibility="gone">
                    <text text="  铡刀拖拽" textColor="#AAAAAA" textSize="11sp" w="0" layout_weight="1" gravity="left|center_vertical"/>
                    <text id="rp1Minus" text=" − " textColor="#FFFFFF" textSize="12sp" bg="#44FFFFFF" padding="5" gravity="center"/>
                    <text id="rp1Val" text="6" textColor="#FFFFFF" textSize="12sp" w="24" gravity="center"/>
                    <text id="rp1Plus" text=" + " textColor="#FFFFFF" textSize="12sp" bg="#44FFFFFF" padding="5" gravity="center"/>
                </horizontal>
            </vertical>
        </vertical>
    );
    ctrlWin.setPosition(10, 10);
    var sx, sy, srx, sry;
    ctrlWin.drag.setOnTouchListener(function (view, event) {
        switch (event.getAction()) {
            case event.ACTION_DOWN:
                sx = ctrlWin.getX(); sy = ctrlWin.getY();
                srx = event.getRawX(); sry = event.getRawY();
                break;
            case event.ACTION_MOVE:
                ctrlWin.setPosition(
                    sx + (event.getRawX() - srx),
                    sy + (event.getRawY() - sry)
                );
                break;
        }
        return true;
    });
    ctrlWin.setBtn.click(function () {
        if (CTRL.actionInProgress && !CTRL.paused) {
            toastLog("动作进行中，设置暂不可用");
            return;
        }
        if (CTRL.settingsOpen) {
            CTRL.settingsOpen = false;
            ctrlWin.panel.post(function () { ctrlWin.panel.setVisibility(8); });
        } else {
            CTRL.settingsOpen = true;
            syncSettingsPanelToState();
            ctrlWin.panel.post(function () { ctrlWin.panel.setVisibility(0); });
        }
    });
    ctrlWin.ppBtn.click(function () {
        if (CTRL.paused) {
            threads.start(function () {
                showResumeChoiceDialog();
            });
        } else {
            CTRL.paused = true;
            ctrlWin.ppBtn.post(function () { ctrlWin.ppBtn.setText(" ▶ "); });
            toastLog("动作已暂停");
        }
    });
    ctrlWin.potionTgl.click(function () {
        if (potionActive) {
            threads.start(function () {
                var ok = dialogs.confirm("确定关闭加速酒？");
                if (!ok) return;
                potionActive = false;
                setToggleOff(ctrlWin.potionTgl);
                setRowVisible(ctrlWin.potionDurRow, false);
                log("加速酒已关闭");
            });
        } else {
            potionActive = true;
            potionHours = 6;
            potionStartTime = Date.now();
            setToggleOn(ctrlWin.potionTgl);
            ctrlWin.pHours.post(function () { ctrlWin.pHours.setText("6"); });
            setRowVisible(ctrlWin.potionDurRow, true);
            log("加速酒已开启: 6小时");
        }
    });
    ctrlWin.pMinus.click(function () {
        var cur = parseInt(ctrlWin.pHours.getText().toString(), 10) || 6;
        if (cur > 1) {
            cur--;
            potionHours = cur;
            potionStartTime = Date.now();
            ctrlWin.pHours.post(function () { ctrlWin.pHours.setText("" + cur); });
        }
    });
    ctrlWin.pPlus.click(function () {
        var cur = parseInt(ctrlWin.pHours.getText().toString(), 10) || 6;
        if (cur < 24) {
            cur++;
            potionHours = cur;
            potionStartTime = Date.now();
            ctrlWin.pHours.post(function () { ctrlWin.pHours.setText("" + cur); });
        }
    });
    ctrlWin.chickenTgl.click(function () {
        if (PANEL.CHICKEN_ENABLED) {
            threads.start(function () {
                var ok = dialogs.confirm("确定关闭鸡场流程吗？");
                if (!ok) return;
                PANEL.CHICKEN_ENABLED = 0;
                setToggleOff(ctrlWin.chickenTgl);
                setRowVisible(ctrlWin.cp1Row, false);
                setRowVisible(ctrlWin.cp2Row, false);
                log("鸡场已关闭");
            });
        } else {
            threads.start(function () {
                if (!chickenCalibrated) {
                    forceCloseSettingsPanel();
                    CTRL.paused = true;
                    ctrlWin.ppBtn.post(function () { ctrlWin.ppBtn.setText(" ▶ "); });
                    toastLog("动作已暂停，即将开始校准鸡蛋位置");
                    sleep(600);
                    CONFIG.eggSlotInWarehouse = calibrateAndVerify("打开仓库，把红十字拖到鸡蛋图标上，再点\"确定这里\"");
                    CONFIG.eggSellBtn = calibrateAndVerify("点一下鸡蛋弹出详情，把红十字拖到\"出售\"按钮上，再点\"确定这里\"");
                    chickenCalibrated = true;
                    calibStorage.put('eggSlot', CONFIG.eggSlotInWarehouse);
                    calibStorage.put('eggBtn', CONFIG.eggSellBtn);
                    calibStorage.put('chickenCalibrated', true);
                    toastLog("鸡蛋坐标记好了，回到中心土地后点播放继续");
                }
                PANEL.CHICKEN_ENABLED = 1;
                setToggleOn(ctrlWin.chickenTgl);
                ctrlWin.cp1Val.post(function () { ctrlWin.cp1Val.setText("" + PANEL.FACTORY_FEED_PULLS); });
                ctrlWin.cp2Val.post(function () { ctrlWin.cp2Val.setText("" + PANEL.RICE_EVERY_N_CHICKEN); });
                setRowVisible(ctrlWin.cp1Row, true);
                setRowVisible(ctrlWin.cp2Row, true);
            });
        }
    });
    ctrlWin.cp1Minus.click(function () {
        if (PANEL.FACTORY_FEED_PULLS > 1) {
            PANEL.FACTORY_FEED_PULLS--;
            ctrlWin.cp1Val.post(function () { ctrlWin.cp1Val.setText("" + PANEL.FACTORY_FEED_PULLS); });
        }
    });
    ctrlWin.cp1Plus.click(function () {
        if (PANEL.FACTORY_FEED_PULLS < 10) {
            PANEL.FACTORY_FEED_PULLS++;
            ctrlWin.cp1Val.post(function () { ctrlWin.cp1Val.setText("" + PANEL.FACTORY_FEED_PULLS); });
        }
    });
    ctrlWin.cp2Minus.click(function () {
        if (PANEL.RICE_EVERY_N_CHICKEN > 1) {
            PANEL.RICE_EVERY_N_CHICKEN--;
            CONFIG.RICE_EVERY_N_CHICKEN_CYCLES = PANEL.RICE_EVERY_N_CHICKEN;
            ctrlWin.cp2Val.post(function () { ctrlWin.cp2Val.setText("" + PANEL.RICE_EVERY_N_CHICKEN); });
        }
    });
    ctrlWin.cp2Plus.click(function () {
        if (PANEL.RICE_EVERY_N_CHICKEN < 20) {
            PANEL.RICE_EVERY_N_CHICKEN++;
            CONFIG.RICE_EVERY_N_CHICKEN_CYCLES = PANEL.RICE_EVERY_N_CHICKEN;
            ctrlWin.cp2Val.post(function () { ctrlWin.cp2Val.setText("" + PANEL.RICE_EVERY_N_CHICKEN); });
        }
    });
    ctrlWin.ranchTgl.click(function () {
        if (PANEL.RANCH_ENABLED) {
            threads.start(function () {
                var ok = dialogs.confirm("确定关闭马场流程吗？");
                if (!ok) return;
                PANEL.RANCH_ENABLED = 0;
                setToggleOff(ctrlWin.ranchTgl);
                setRowVisible(ctrlWin.rp1Row, false);
                log("马场已关闭");
            });
        } else {
            threads.start(function () {
                if (!ranchCalibrated) {
                    forceCloseSettingsPanel();
                    CTRL.paused = true;
                    ctrlWin.ppBtn.post(function () { ctrlWin.ppBtn.setText(" ▶ "); });
                    toastLog("动作已暂停，即将开始校准马奶位置");
                    sleep(600);
                    CONFIG.milkSlotInWarehouse = calibrateAndVerify("打开仓库，把红十字拖到马奶图标上，再点\"确定这里\"");
                    CONFIG.milkSellBtn = calibrateAndVerify("点一下马奶弹出详情，把红十字拖到\"出售\"按钮上，再点\"确定这里\"");
                    ranchCalibrated = true;
                    calibStorage.put('milkSlot', CONFIG.milkSlotInWarehouse);
                    calibStorage.put('milkBtn', CONFIG.milkSellBtn);
                    calibStorage.put('ranchCalibrated', true);
                    toastLog("马奶坐标记好了，回到中心土地后点播放继续");
                }
                PANEL.RANCH_ENABLED = 1;
                setToggleOn(ctrlWin.ranchTgl);
                ctrlWin.rp1Val.post(function () { ctrlWin.rp1Val.setText("" + PANEL.CHOP_FEED_PULLS); });
                setRowVisible(ctrlWin.rp1Row, true);
            });
        }
    });
    ctrlWin.rp1Minus.click(function () {
        if (PANEL.CHOP_FEED_PULLS > 1) {
            PANEL.CHOP_FEED_PULLS--;
            ctrlWin.rp1Val.post(function () { ctrlWin.rp1Val.setText("" + PANEL.CHOP_FEED_PULLS); });
        }
    });
    ctrlWin.rp1Plus.click(function () {
        if (PANEL.CHOP_FEED_PULLS < 20) {
            PANEL.CHOP_FEED_PULLS++;
            ctrlWin.rp1Val.post(function () { ctrlWin.rp1Val.setText("" + PANEL.CHOP_FEED_PULLS); });
        }
    });
    syncSettingsPanelToState();
}
// ================= 启动流程 =================
try {
    var __testWin = floaty.window(<text text="."/>);
    __testWin.close();
} catch (e) {
    toastLog("没有悬浮窗权限，去系统设置里给这个App开「显示在其他应用上层/悬浮窗」权限，然后重新运行");
    releaseLock(); exit();
}
toastLog("即将请求截屏权限，请点击允许");
var checkPermission = false;
try { 
    checkPermission = requestScreenCapture(); 
} catch (e) {}

if (!checkPermission) {
    toastLog("你取消了截屏权限，脚本已终止。");
    releaseLock();
    exit(); 
}
sleep(1000);
if (chickenCalibrated || ranchCalibrated) {
    var keepCalib = dialogs.confirm(
        "发现历史坐标", 
        "是否继续使用上次保存的鸡蛋/马奶位置？\n(如果游戏里格子变了，请选取消)\n\n【确定】直接使用\n【取消】重新校准"
    );
    if (!keepCalib) {
        calibStorage.clear();
        chickenCalibrated = false;
        ranchCalibrated = false;
        toastLog("旧坐标已清除，准备重新校准");
        sleep(500);
    }
}
if (PANEL.CHICKEN_ENABLED) {
    if (!chickenCalibrated) {
        CONFIG.eggSlotInWarehouse = calibrateAndVerify("打开仓库，把红十字拖到鸡蛋图标上，再点\"确定这里\"");
        CONFIG.eggSellBtn = calibrateAndVerify("点一下鸡蛋弹出详情，把红十字拖到\"出售\"按钮上，再点\"确定这里\"");
        chickenCalibrated = true;
        calibStorage.put('eggSlot', CONFIG.eggSlotInWarehouse);
        calibStorage.put('eggBtn', CONFIG.eggSellBtn);
        calibStorage.put('chickenCalibrated', true);
        toastLog("鸡蛋坐标记好了：格子" + CONFIG.eggSlotInWarehouse + " / 出售" + CONFIG.eggSellBtn);
    } else {
        toastLog("检测到已保存的鸡蛋坐标，跳过定位");
    }
}
if (PANEL.RANCH_ENABLED) {
    if (!ranchCalibrated) {
        CONFIG.milkSlotInWarehouse = calibrateAndVerify("打开仓库，把红十字拖到马奶图标上，再点\"确定这里\"");
        CONFIG.milkSellBtn = calibrateAndVerify("点一下马奶弹出详情，把红十字拖到\"出售\"按钮上，再点\"确定这里\"");
        ranchCalibrated = true;
        calibStorage.put('milkSlot', CONFIG.milkSlotInWarehouse);
        calibStorage.put('milkBtn', CONFIG.milkSellBtn);
        calibStorage.put('ranchCalibrated', true);
        toastLog("马奶坐标记好了：格子" + CONFIG.milkSlotInWarehouse + " / 出售" + CONFIG.milkSellBtn);
    } else {
        toastLog("检测到已保存的马奶坐标，跳过定位");
    }
}
while (true) {
    var usedPotion = dialogs.confirm("是否使用了生长加速酒？");
    if (!usedPotion) break;
    var hours = 6;
    var actionClicked = null;
    var d = dialogs.build({
        title: "加速酒作用时长（小时）",
        customView: (
            <vertical padding="16">
                <horizontal gravity="center" marginTop="8">
                    <button id="btnMinus" text=" - " w="80" h="60" textSize="24sp" textStyle="bold" />
                    <text id="tvHours" text="6" textColor="#000000" textSize="28sp" textStyle="bold" w="80" gravity="center" />
                    <button id="btnPlus" text=" + " w="80" h="60" textSize="24sp" textStyle="bold" />
                </horizontal>
            </vertical>
        ),
        positive: "确定",
        negative: "返回"
    }).on("any", function (action, dialog) {
        actionClicked = action;
    });
    var view = d.getCustomView();
    view.btnMinus.click(function() {
        if (hours > 1) {
            hours--;
            view.tvHours.setText(hours.toString());
        }
    });
    view.btnPlus.click(function() {
        if (hours < 24) {
            hours++;
            view.tvHours.setText(hours.toString());
        }
    });
    d.show();
    while (actionClicked == null) {
        sleep(100);
    }
    if (actionClicked != "positive") {
        continue;
    }
    potionHours = hours;
    potionStartTime = Date.now();
    potionActive = true;
    toastLog("加速酒生效 " + potionHours + " 小时（实际提前5分钟失效）");
    break;
}
toastLog("10秒内切回游戏摆好镜头，注意仓库里鸡蛋/马奶的位置不能发生变动！");
sleepWithHeartbeat(10000);
captureReferencePatch();
var initImg = safeCaptureScreen();
if (!initImg) {
    toastLog("截图权限获取失败，退出");
    releaseLock(); exit();
}
initImg.recycle();
createControlPanel();
toastLog("记录完毕，开始挂机");
log('截屏统计初始化: 总计=' + captureStats.total + ' 失败=' + captureStats.failed);
// ================= 主循环 =================
while (true) {
    try {
        renewLock();
        if (skipToHarvestOnce) {
            skipToHarvestOnce = false;
            var menuAlreadyOpenH = pendingMenuAlreadyOpen;
            pendingMenuAlreadyOpen = false;
            log('===== 跳过种植与卖货，直接收割' + (menuAlreadyOpenH ? '（复用挽救流程已打开的菜单，不再多点一次中心地）' : '') + ' =====');
            setActionInProgress(true);
            if (!menuAlreadyOpenH) {
                // 手动暂停->点播放 这条路径走到这里时菜单是关闭的，按原来的方式
                // 清场后交给 harvestAll() 自己重新点开。
                click(CONFIG.SAFE_CLOSE[0], CONFIG.SAFE_CLOSE[1]);
                sleep(500);
            }
            harvestAll(menuAlreadyOpenH);
        } else {
            DriftGuard.reset();
            log('===== 主循环开始 ' + new Date().toLocaleTimeString() + ' =====');
            var menuAlreadyOpenP = pendingMenuAlreadyOpen;
            pendingMenuAlreadyOpen = false;
            plantAll(menuAlreadyOpenP);
            sellCropsAndEggs();
            if (bubbleDetectSuspended) {
                toastLog('爆仓挽救或挽救后判定待播种，本轮跳过鸡场/马场检测');
                log('bubbleDetectSuspended=true，跳过本轮 checkAndRunFarmTasks/checkAndRunRanchTasks');
                chickenPendingRound = false;
                ranchPendingRound = false;
            } else {
                checkAndRunFarmTasks();
                checkAndRunRanchTasks();
            }
            var midResult = DriftGuard.midFlowRecheck();
            if (midResult === 'drift') {
                toastLog('中间补测确认画面偏移，自动重连恢复中…');
                log('[主循环] midFlowRecheck 升级三图校验确认偏移，触发挽救流程');
                var midDetection = recoverFromFreeze('midflow中间补测确认偏移', 'drift');
                throw new RecoveredCycleSignal(midDetection.mode, midDetection.menuAlreadyOpen);
            } else if (midResult === 'warehouseFull') {
                handleWarehouseFullDuringHarvest();
            }
            waitUntilFree();
            harvestAll(false);
            log('===== 主循环完成 | 截屏: ' + captureStats.total + '次, 失败: ' + captureStats.failed + '次 =====');
        }
    } catch (e) {
        if (e instanceof PauseSignal) {
            handlePauseAndResume();
        } else if (e instanceof RecoveredCycleSignal) {
            skipToHarvestOnce = (e.mode === 'harvest');
            pendingMenuAlreadyOpen = e.menuAlreadyOpen;
            if (e.mode === 'plant') {
                // 理论上不该出现（回中后一般都是待收割），但仍然兜底：跳过
                // 下一轮气泡检测，防止外面还有残留没清干净。
                bubbleDetectSuspended = true;
                log('[FreezeRecovery] 回中后判定为待播种（理论上少见），标记跳过下一轮鸡场/马场气泡检测');
            }
            log('[FreezeRecovery] 恢复流程结束，下一轮将直接' + (skipToHarvestOnce ? '收割' : '重新种植') +
                '（菜单' + (pendingMenuAlreadyOpen ? '已打开，直接复用' : '未打开，自行重新点开') + '），衔接主循环继续');
        } else {
            toastLog("主循环异常：" + (e && e.message ? e.message : e));
            log("完整异常堆栈: " + e);
            sleep(3000);
        }
    }
}