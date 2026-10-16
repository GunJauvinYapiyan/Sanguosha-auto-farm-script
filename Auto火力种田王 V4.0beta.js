// Auto火力种田王 刷经验轮种改版（1麦1稻1豆1蔗×8轮 + 2玉米1麦1稻循环）+ 良田小麦 + 上方玉米
// 提示：悬浮窗请置于左上人物名片处，避开最左上角水域及主页金属色UI。

auto.waitFor();
floaty.closeAll();

// ==================== 控制面板 ====================
var PANEL = {
    WHEAT_COOLDOWN_SEC: 120,          // 小麦成熟秒数（2分钟）
    RICE_COOLDOWN_SEC: 300,           // 水稻成熟秒数（5分钟）
    SOY_COOLDOWN_SEC: 600,            // 大豆成熟秒数（10分钟）
    CANE_COOLDOWN_SEC: 1800,          // 甘蔗成熟秒数（30分钟）
    CORN_COOLDOWN_SEC: 3600,          // 主田玉米成熟秒数（60分钟）
    FACTORY_FEED_PULLS: 5,            // 鸡场铡刀坊拖拽次数
    CHOP_FEED_PULLS: 6,               // 马场铡刀坊拖拽次数
    CHICKEN_ENABLED: 1,               // 1=开启鸡场，0=关闭
    RANCH_ENABLED: 1,                 // 1=开启马场，0=关闭
    STATION_LOAD_ENABLED: 0,          // 1=驿站顺带点装载，0=只收货
    BUBBLE_POLL_SEC: 5,               // 气泡检测间隔秒数
    BUBBLE_STOP_BEFORE_READY_SEC: 20, // 成熟前停止气泡检测秒数
    PARTIAL_GRACE_SEC: 30,            // 气泡不齐宽限秒数（超时抢收）
    SICKLE_CHECK_ENABLED: 0,
    SICKLE_POLL_MAX_SEC: 90,
    SELL_ONLY_AFTER_HARVEST: 1,       // 1=仅出售收割后未卖过的存货
    EGG_MILK_BATCH_WAIT_SEC: 40,      // 鸡蛋/马奶合并变卖等待秒数
    FERTILE_ENABLED: 1,               // 1=开启良田小麦流程
    FERTILE_INTERVAL_SEC: 120,        // 良田收种间隔秒数
    FERTILE_EXTRA_WHEAT_SELLS: 2,     // 卖鸡蛋那趟仓库顺带卖小麦次数（固定消化小麦，主轮种表不再卖小麦）
    CORN_ENABLED: 1,                  // 1=开启上方新田地玉米流程
    LOBBY_ENTER_LIST_BTN: [2250, 995],
    LOBBY_ENTER_FARM_BTN: [1535, 290]
};

// ==================== 轮种表（前8轮47min四作物循环 + 第9轮起2玉米1麦1稻无限循环） ====================
// 规则说明：
//   1. 小麦完全依靠鸡场卖鸡蛋时顺带变卖2次（FERTILE_EXTRA_WHEAT_SELLS=2），轮种表内全程不卖小麦。
//   2. 第1～7次循环（每次47min）：1小麦 → 1水稻（收完卖1次） → 1大豆（收完卖2次） → 1甘蔗（收完卖3次）。
//   3. 第8次循环（47min）：1小麦 → 1水稻 → 1大豆 → 1甘蔗，本轮四种作物收割后全部不卖，留作存货。
//   4. 第9次循环及以后（每次127min，无限循环）：2轮主田玉米（每收1次卖2次） → 补1轮小麦 + 1轮水稻（均不卖）。
var SCHEDULE = [
    // 第1次循环（开局首轮甘蔗尚未收割，会自动跳过变卖）
    { cycle: 1, crop: 'wheat', sells: [['cane', 3]] },
    { cycle: 1, crop: 'rice',  sells: [], keepStock: ['wheat'] },
    { cycle: 1, crop: 'soy',   sells: [['rice', 1]] },
    { cycle: 1, crop: 'cane',  sells: [['soy', 2]] },

    // 第2次循环
    { cycle: 2, crop: 'wheat', sells: [['cane', 3]] },
    { cycle: 2, crop: 'rice',  sells: [], keepStock: ['wheat'] },
    { cycle: 2, crop: 'soy',   sells: [['rice', 1]] },
    { cycle: 2, crop: 'cane',  sells: [['soy', 2]] },

    // 第3次循环
    { cycle: 3, crop: 'wheat', sells: [['cane', 3]] },
    { cycle: 3, crop: 'rice',  sells: [], keepStock: ['wheat'] },
    { cycle: 3, crop: 'soy',   sells: [['rice', 1]] },
    { cycle: 3, crop: 'cane',  sells: [['soy', 2]] },

    // 第4次循环
    { cycle: 4, crop: 'wheat', sells: [['cane', 3]] },
    { cycle: 4, crop: 'rice',  sells: [], keepStock: ['wheat'] },
    { cycle: 4, crop: 'soy',   sells: [['rice', 1]] },
    { cycle: 4, crop: 'cane',  sells: [['soy', 2]] },

    // 第5次循环
    { cycle: 5, crop: 'wheat', sells: [['cane', 3]] },
    { cycle: 5, crop: 'rice',  sells: [], keepStock: ['wheat'] },
    { cycle: 5, crop: 'soy',   sells: [['rice', 1]] },
    { cycle: 5, crop: 'cane',  sells: [['soy', 2]] },

    // 第6次循环
    { cycle: 6, crop: 'wheat', sells: [['cane', 3]] },
    { cycle: 6, crop: 'rice',  sells: [], keepStock: ['wheat'] },
    { cycle: 6, crop: 'soy',   sells: [['rice', 1]] },
    { cycle: 6, crop: 'cane',  sells: [['soy', 2]] },

    // 第7次循环
    { cycle: 7, crop: 'wheat', sells: [['cane', 3]] },
    { cycle: 7, crop: 'rice',  sells: [], keepStock: ['wheat'] },
    { cycle: 7, crop: 'soy',   sells: [['rice', 1]] },
    { cycle: 7, crop: 'cane',  sells: [['soy', 2]] },

    // 第8次循环（第1步先卖掉第7次循环收尾的甘蔗3次；本轮收割的小麦/水稻/大豆/甘蔗全部留存不卖）
    { cycle: 8, crop: 'wheat', sells: [['cane', 3]] },
    { cycle: 8, crop: 'rice',  sells: [], keepStock: ['wheat'] },
    { cycle: 8, crop: 'soy',   sells: [], keepStock: ['rice'] },
    { cycle: 8, crop: 'cane',  sells: [], keepStock: ['soy'] },

    // 第9次及以后循环（2玉米[每次卖2次] → 1小麦[不卖] → 1水稻[不卖]，无限循环）
    { cycle: 9, crop: 'corn',  sells: [], keepStock: ['cane', 'rice'] },
    { cycle: 9, crop: 'corn',  sells: [['corn', 2]] },
    { cycle: 9, crop: 'wheat', sells: [['corn', 2]] },
    { cycle: 9, crop: 'rice',  sells: [], keepStock: ['wheat'] }
];

var SCHEDULE_LOOP_START_IDX = 32; // 跑完第36步（索引35）后回到第9次循环首步（索引32）无限循环
var CYCLE9_REPLENISH_IDX = 34;    // 第9次循环中补种小麦+水稻的起始索引（抢收缺料时可直接切入补粮）

function getCurrentCycleStartIdx(idx) {
    var curCycle = SCHEDULE[idx] ? SCHEDULE[idx].cycle : 1;
    if (curCycle >= 9) return CYCLE9_REPLENISH_IDX;
    for (var i = 0; i < SCHEDULE.length; i++) {
        if (SCHEDULE[i].cycle === curCycle) return i;
    }
    return 0;
}

var OVERFLOW_SELLS = [['wheat', 2], ['rice', 2], ['soy', 2], ['cane', 2], ['corn', 2]];

// ================= 调试截图与实例锁 =================
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
        if (CTRL.paused) {
            throw new PauseSignal();
        }
    }
}
if (!acquireLock()) {
    toastLog("检测到脚本已在运行，或上次停止不足20秒，本次启动已取消，稍后再试");
    sleep(1500);
    exit();
}
events.on("exit", function () { releaseLock(); });

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

// ================= 全局坐标与参数配置 =================
var CONFIG = {
    CENTER_TILE: [1200, 540],
    targetTile: [1200, 540],
    seedIcon: [740, 910],
    riceSeedIcon: [935, 900],
    soySeedIcon: [1111, 900],
    cornSeedIcon: [1480, 910],
    sickleIcon: [1220, 856],
    LEFT_X: 170, RIGHT_X: 2250,
    warehouseBtn: [2350, 480],
    warehouseConfirmBtn: [1890, 230],
    returnToFieldBtn: [586, 662],
    wheatSlotInWarehouse: [790, 333],
    sellBtn: [780, 790],
    riceSlotInWarehouse: [980, 360],
    riceSellBtn: [980, 800],
    soySlotInWarehouse: [1180, 333],
    soySellBtn: [1180, 790],
    caneSlotInWarehouse: [1380, 333],
    caneSellBtn: [1380, 790],
    cornSlotInWarehouse: [1580, 320],
    cornSellBtn: [1580, 785],
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
    bubble_R1: [195, 853],
    bubble_R2: [1060, 853],
    bubble_CHOP: [665, 1060],
    build_R1: [80, 1025],  enter_R1: [455, 390],
    build_R2: [1325, 755], enter_R2: [1325, 390],
    build_CHOP: [975, 865], enter_CHOP: [880, 475],
    chopFeedIcon: [1216, 870],
    recenterTileAfterFarm: [1215, 775],
    SAFE_CLOSE: [2290, 980],
    factoryPopupSafeClick: [1760, 400],
    coopPopupSafeClick: [1760, 320],
    warehouseFullCheckRegion: [800, 480, 200, 140],
    warehouseFullUniformTolerance: 12,
    warehouseFullColorRef: [235, 229, 203],
    warehouseFullColorTolerance: 20,
    warehouseFullCloseBtn: [2290, 980],
    FEED_DRAG_DIST: 200,
    FEED_DRAG_MS: 180,
    readyBufferMs: 4000,
    holdMs: 400
};
CONFIG.caneSeedIcon = CONFIG.sickleIcon;

var PARAMS = {
    wheat:      { topY: 151, bottomY: 924, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.seedIcon,     loop1Ms: 36, loop2Ms: 17, loop3Ms: 15 },
    rice:       { topY: 153, bottomY: 924, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.riceSeedIcon, loop1Ms: 36, loop2Ms: 21, loop3Ms: 20 },
    soy:        { topY: 153, bottomY: 926, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.soySeedIcon,  loop1Ms: 36, loop2Ms: 21, loop3Ms: 20 },
    cane:       { topY: 153, bottomY: 926, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.caneSeedIcon, loop1Ms: 36, loop2Ms: 18, loop3Ms: 14 },
    corn:       { topY: 153, bottomY: 925, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.cornSeedIcon, loop1Ms: 36, loop2Ms: 18, loop3Ms: 14 },
    sickle:     { topY: 153, bottomY: 925, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.sickleIcon,   loop1Ms: 36, loop2Ms: 18, loop3Ms: 14 },
    riceSickle: { topY: 153, bottomY: 924, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.sickleIcon,   loop1Ms: 36, loop2Ms: 21, loop3Ms: 20 }
};
CONFIG.LOOP_COUNT = 3;

// ================= [良田] 参数 =================
var FERTILE = {
    ENTER_BTN: [60, 480],
    BACK_BTN: [2200, 570],
    ENTER_WAIT_MS: 500,
    TRIPLE_GAP_MS: 80,
    AFTER_TRIPLE_MS: 120,
    BACK_WAIT_MS: 1000,
    HOLD_PTS: 7,
    MOVE_STEPS: 10,
    MS_PER_PT: 25
};
var fertileLastPlantTime = 0;

// ================= 作物表 =================
var CROPS = {
    wheat: { label: '小麦', plantKey: 'wheat', harvestKey: 'sickle',     cooldownSec: PANEL.WHEAT_COOLDOWN_SEC, slot: CONFIG.wheatSlotInWarehouse, sellBtn: CONFIG.sellBtn },
    rice:  { label: '水稻', plantKey: 'rice',  harvestKey: 'riceSickle', cooldownSec: PANEL.RICE_COOLDOWN_SEC,  slot: CONFIG.riceSlotInWarehouse,  sellBtn: CONFIG.riceSellBtn },
    soy:   { label: '大豆', plantKey: 'soy',   harvestKey: 'sickle',     cooldownSec: PANEL.SOY_COOLDOWN_SEC,   slot: CONFIG.soySlotInWarehouse,   sellBtn: CONFIG.soySellBtn },
    cane:  { label: '甘蔗', plantKey: 'cane',  harvestKey: 'sickle',     cooldownSec: PANEL.CANE_COOLDOWN_SEC,  slot: CONFIG.caneSlotInWarehouse,  sellBtn: CONFIG.caneSellBtn },
    corn:  { label: '玉米', plantKey: 'corn',  harvestKey: 'sickle',     cooldownSec: PANEL.CORN_COOLDOWN_SEC,  slot: CONFIG.cornSlotInWarehouse,  sellBtn: CONFIG.cornSellBtn }
};
var CROP_KEYS = ['wheat', 'rice', 'soy', 'cane', 'corn'];

// ================= 状态变量 =================
var lastPlantTime = 0;
var currentCrop = 'wheat';
var roundIdx = 0;
var totalLoopsAfter9 = 0;
var sellsDoneThisRound = false;
var resetAfterHarvest = false;
var needSellEggs = false;
var needSellMilk = false;
var consecutiveWarehouseFullRecoveries = 0;
var MAX_CONSECUTIVE_WAREHOUSE_FULL_RECOVERIES = 3;
var chickenPartialSince = 0;
var ranchPartialSince = 0;
var bubbleFlowActive = false;
var bubbleDetectSuspended = false;
var stationGoodsPending = false;
var forceFlowsPending = false;
var unsoldStock = { wheat: false, rice: false, soy: false, cane: false, corn: false };
var plantDone = false;
var pendingSellSince = 0;
var warehouseTripCount = 0;
var centerTouched = false;

// ================= 悬浮控制/暂停状态 =================
var CTRL = {
    paused: false,
    settingsOpen: false,
    actionInProgress: true,
    currentPhase: 'harvest'
};
var skipToHarvestOnce = false;
var skipWaitOnce = false;
var pendingMenuAlreadyOpen = false;
var pendingResumeChoice = null;
function PauseSignal() {}
function RestartCycleSignal() {}
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
function beginAction() {
    if (CTRL.settingsOpen) {
        forceCloseSettingsPanel();
        CTRL.paused = true;
        if (ctrlWin) ctrlWin.ppBtn.post(function () { ctrlWin.ppBtn.setText(" ▶ "); });
        toastLog("动作即将开始，设置未关闭，已自动暂停");
        setActionInProgress(true);
        throw new PauseSignal();
    }
    setActionInProgress(true);
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

// ================= 中心土地防连点 =================
function clickSafeClose() {
    click(CONFIG.SAFE_CLOSE[0], CONFIG.SAFE_CLOSE[1]);
    centerTouched = false;
}
function ensureCenterClean() {
    if (centerTouched) {
        log('[防连点] 上一次碰的是中心土地，先点一下右下角再继续');
        clickSafeClose();
        sleep(400);
    }
}
function clickCenterTile(x, y) {
    ensureCenterClean();
    click(x, y);
    centerTouched = true;
}

// ================= 校准持久化与参考图 =================
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
function regionHasColorNear(img, cx, cy, radius, targetColor, tolerance, step) {
    step = step || 5;
    var w = img.getWidth(), h = img.getHeight();
    for (var dx = -radius; dx <= radius; dx += step) {
        for (var dy = -radius; dy <= radius; dy += step) {
            var px = cx + dx, py = cy + dy;
            if (px < 0 || px >= w || py < 0 || py >= h) continue;
            var c = images.pixel(img, px, py);
            var diff = Math.max(
                Math.abs(colors.red(c) - targetColor[0]),
                Math.abs(colors.green(c) - targetColor[1]),
                Math.abs(colors.blue(c) - targetColor[2])
            );
            if (diff <= tolerance) return true;
        }
    }
    return false;
}

// ================= DriftGuard 偏移校验系统 =================
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
            this.saveDebugImg(img, 'soft_wfull_' + stepName);
            img.recycle();
            return 'warehouseFull';
        }
        this.suspected = true;
        this.suspectCheckpoint = stepName;
        this.saveDebugImg(img, '1_suspect_' + stepName);
        img.recycle();
        log('[DriftGuard] 【偏移嫌疑】' + stepName);
        return 'suspected';
    },
    onBubblesFound: function (source) {
        if (this.suspected) {
            log('[DriftGuard] 【嫌疑解除】' + source + ' 检测到气泡');
            this.suspected = false;
        }
    },
    midFlowRecheck: function () {
        if (!this.suspected) return 'ok';
        var img = safeCaptureScreen();
        if (!img) return 'ok';
        if (this.matchReference(img)) {
            this.refreshReference(img);
            this.suspected = false;
            img.recycle();
            return 'ok';
        }
        this.saveDebugImg(img, '2_midcheck');
        img.recycle();
        return this.finalCheck('midflow_escalate');
    },
    finalCheck: function (stepName) {
        var img = safeCaptureScreen();
        if (!img) return 'ok';
        if (this.matchReference(img)) {
            this.refreshReference(img);
            this.suspected = false;
            img.recycle();
            return 'ok';
        }
        if (this.isWarehouseFull(img)) {
            this.saveDebugImg(img, '3_wfull_' + stepName);
            img.recycle();
            this.suspected = false;
            return 'warehouseFull';
        }
        this.saveDebugImg(img, '3_check1_' + stepName);
        img.recycle();
        sleep(800);
        var img2 = safeCaptureScreen();
        if (img2) {
            if (this.matchReference(img2)) {
                this.refreshReference(img2);
                this.suspected = false;
                img2.recycle();
                return 'ok';
            }
            if (this.isWarehouseFull(img2)) {
                this.saveDebugImg(img2, '3_wfull2_' + stepName);
                img2.recycle();
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
                this.refreshReference(img3);
                this.suspected = false;
                img3.recycle();
                return 'ok';
            }
            if (this.isWarehouseFull(img3)) {
                this.saveDebugImg(img3, '3_wfull3_' + stepName);
                img3.recycle();
                this.suspected = false;
                return 'warehouseFull';
            }
            this.saveDebugImg(img3, '3_check3_' + stepName);
            img3.recycle();
        }
        if (this.crossCompare()) {
            var refreshImg = safeCaptureScreen();
            if (refreshImg) {
                this.refreshReference(refreshImg);
                refreshImg.recycle();
            }
            this.suspected = false;
            return 'ok';
        }
        log('[DriftGuard] 确认画面偏移 (' + stepName + ')');
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
    centerTouched = true;
}

// ================= 气泡检测与鸡场/马场 =================
function isBubblePresent(img, cx, cy) {
    var scanRadius = 55, step = 10, whiteCount = 0;
    var w = img.getWidth(), h = img.getHeight();
    for (var dx = -scanRadius; dx <= scanRadius; dx += step) {
        for (var dy = -scanRadius; dy <= scanRadius; dy += step) {
            var px = cx + dx, py = cy + dy;
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

function pullFeed(x, y) {
    gesture(CONFIG.FEED_DRAG_MS, [x, y], [x, y + CONFIG.FEED_DRAG_DIST]);
}
function pullFeedSafe(x, y) {
    pullFeed(x, y);
    pausableSleep(200);
    click(CONFIG.factoryPopupSafeClick[0], CONFIG.factoryPopupSafeClick[1]);
    pausableSleep(200);
}

function checkAndRunFarmTasks() {
    if (!PANEL.CHICKEN_ENABLED || bubbleFlowActive) return 'none';
    var img = safeCaptureScreen();
    if (!img) return 'none';
    var has_FT = isBubblePresent(img, CONFIG.bubble_FT[0], CONFIG.bubble_FT[1]);
    var has_FB = isBubblePresent(img, CONFIG.bubble_FB[0], CONFIG.bubble_FB[1]);
    var has_EL = isBubblePresent(img, CONFIG.bubble_EL[0], CONFIG.bubble_EL[1]);
    var has_ER = isBubblePresent(img, CONFIG.bubble_ER[0], CONFIG.bubble_ER[1]);
    img.recycle();
    if (has_FT || has_FB || has_EL || has_ER) {
        log("鸡场气泡: FT=" + has_FT + " FB=" + has_FB + " EL=" + has_EL + " ER=" + has_ER);
    }
    var fullChicken = has_FT && has_FB && has_EL && has_ER;
    var partialChicken = has_EL || has_ER;
    if (partialChicken || has_FT || has_FB) {
        DriftGuard.onBubblesFound('鸡场');
    }
    var mode = 'none';
    if (fullChicken) {
        mode = 'full';
        chickenPartialSince = 0;
        toastLog("鸡场四气泡齐了，开始处理");
    } else if (partialChicken) {
        if (chickenPartialSince === 0) {
            chickenPartialSince = Date.now();
        } else if (Date.now() - chickenPartialSince >= PANEL.PARTIAL_GRACE_SEC * 1000) {
            mode = 'grab';
            chickenPartialSince = 0;
            toastLog("鸡场气泡超时仍不齐，抢收");
        }
    } else {
        chickenPartialSince = 0;
    }
    if (mode === 'none') return 'none';
    return runChickenFlow(mode, has_FT, has_FB, has_EL, has_ER);
}

function runChickenFlow(mode, has_FT, has_FB, has_EL, has_ER) {
    beginAction();
    bubbleFlowActive = true;
    if (has_FB) { click(CONFIG.bubble_FB[0], CONFIG.bubble_FB[1]); pausableSleep(400); }
    if (has_FT) { click(CONFIG.bubble_FT[0], CONFIG.bubble_FT[1]); pausableSleep(400); }
    if (has_EL) { click(CONFIG.bubble_EL[0], CONFIG.bubble_EL[1]); pausableSleep(400); }
    if (has_ER) { click(CONFIG.bubble_ER[0], CONFIG.bubble_ER[1]); pausableSleep(400); }
    pausableSleep(400);
    var factX = CONFIG.factoryFeedIcon[0], factY = CONFIG.factoryFeedIcon[1];
    click(CONFIG.build_FB[0], CONFIG.build_FB[1]); pausableSleep(1000);
    click(CONFIG.enter_FB[0], CONFIG.enter_FB[1]); pausableSleep(1500);
    for (var i = 0; i < PANEL.FACTORY_FEED_PULLS; i++) pullFeedSafe(factX, factY);
    clickSafeClose(); pausableSleep(1000);
    click(CONFIG.build_FT[0], CONFIG.build_FT[1]); pausableSleep(1000);
    click(CONFIG.enter_FT[0], CONFIG.enter_FT[1]); pausableSleep(1500);
    for (var i2 = 0; i2 < PANEL.FACTORY_FEED_PULLS; i2++) pullFeedSafe(factX, factY);
    clickSafeClose(); pausableSleep(1000);
    click(CONFIG.build_CL[0], CONFIG.build_CL[1]); pausableSleep(1000);
    click(CONFIG.enter_CL[0], CONFIG.enter_CL[1]); pausableSleep(1500);
    gesture(1500, CONFIG.coopFeedIcon, CONFIG.coopChicken1, CONFIG.coopChicken6);
    pausableSleep(200);
    click(CONFIG.coopPopupSafeClick[0], CONFIG.coopPopupSafeClick[1]);
    pausableSleep(400);
    clickSafeClose(); pausableSleep(1000);
    click(CONFIG.build_CR[0], CONFIG.build_CR[1]); pausableSleep(1000);
    click(CONFIG.enter_CR[0], CONFIG.enter_CR[1]); pausableSleep(1500);
    gesture(1500, CONFIG.coopFeedIcon, CONFIG.coopChicken1, CONFIG.coopChicken6);
    pausableSleep(200);
    click(CONFIG.coopPopupSafeClick[0], CONFIG.coopPopupSafeClick[1]);
    pausableSleep(400);
    clickSafeClose(); pausableSleep(1000);
    click(CONFIG.recenterTileAfterFarm[0], CONFIG.recenterTileAfterFarm[1]);
    centerTouched = true;
    pausableSleep(1000);
    needSellEggs = true;
    bubbleFlowActive = false;
    return mode;
}

function checkAndRunRanchTasks() {
    if (!PANEL.RANCH_ENABLED || bubbleFlowActive) return 'none';
    var img = safeCaptureScreen();
    if (!img) return 'none';
    var has_R1 = isBubblePresent(img, CONFIG.bubble_R1[0], CONFIG.bubble_R1[1]);
    var has_R2 = isBubblePresent(img, CONFIG.bubble_R2[0], CONFIG.bubble_R2[1]);
    img.recycle();
    if (has_R1 || has_R2) {
        log("马场气泡: R1=" + has_R1 + " R2=" + has_R2);
        DriftGuard.onBubblesFound('马场');
    }
    var fullRanch = has_R1 && has_R2;
    var partialRanch = has_R1 || has_R2;
    var mode = 'none';
    if (fullRanch) {
        mode = 'full';
        ranchPartialSince = 0;
        toastLog("马场气泡齐了，开始处理");
    } else if (partialRanch) {
        if (ranchPartialSince === 0) {
            ranchPartialSince = Date.now();
        } else if (Date.now() - ranchPartialSince >= PANEL.PARTIAL_GRACE_SEC * 1000) {
            mode = 'grab';
            ranchPartialSince = 0;
            toastLog("马场气泡超时仍不齐，抢收");
        }
    } else {
        ranchPartialSince = 0;
    }
    if (mode === 'none') return 'none';
    return runRanchFlow(mode, has_R1, has_R2, true);
}

function runRanchFlow(mode, has_R1, has_R2, clickChop) {
    beginAction();
    bubbleFlowActive = true;
    if (has_R1) { click(CONFIG.bubble_R1[0], CONFIG.bubble_R1[1]); pausableSleep(400); }
    if (has_R2) { click(CONFIG.bubble_R2[0], CONFIG.bubble_R2[1]); pausableSleep(400); }
    if (clickChop) { click(CONFIG.bubble_CHOP[0], CONFIG.bubble_CHOP[1]); pausableSleep(800); }
    pausableSleep(1000);
    click(CONFIG.build_R1[0], CONFIG.build_R1[1]); pausableSleep(1000);
    click(CONFIG.enter_R1[0], CONFIG.enter_R1[1]); pausableSleep(1500);
    gesture(1500, CONFIG.coopFeedIcon, CONFIG.coopChicken1, CONFIG.coopChicken6);
    pausableSleep(200);
    click(CONFIG.coopPopupSafeClick[0], CONFIG.coopPopupSafeClick[1]);
    pausableSleep(400);
    clickSafeClose(); pausableSleep(1000);
    click(CONFIG.build_R2[0], CONFIG.build_R2[1]); pausableSleep(1000);
    click(CONFIG.enter_R2[0], CONFIG.enter_R2[1]); pausableSleep(1500);
    gesture(1500, CONFIG.coopFeedIcon, CONFIG.coopChicken1, CONFIG.coopChicken6);
    pausableSleep(200);
    click(CONFIG.coopPopupSafeClick[0], CONFIG.coopPopupSafeClick[1]);
    pausableSleep(400);
    clickSafeClose(); pausableSleep(2000);
    click(CONFIG.build_CHOP[0], CONFIG.build_CHOP[1]); pausableSleep(1000);
    click(CONFIG.enter_CHOP[0], CONFIG.enter_CHOP[1]); pausableSleep(1500);
    for (var i = 0; i < PANEL.CHOP_FEED_PULLS; i++) {
        pullFeedSafe(CONFIG.chopFeedIcon[0], CONFIG.chopFeedIcon[1]);
    }
    clickSafeClose(); pausableSleep(1000);
    click(971, 366); pausableSleep(3000);
    click(1742, 157); pausableSleep(1000);
    needSellMilk = true;
    bubbleFlowActive = false;
    return mode;
}

function runForcedFlows() {
    log('[断线恢复] 强制各跑一次鸡场/马场流程');
    if (PANEL.CHICKEN_ENABLED) {
        var ft = false, fb = false, el = false, er = false;
        var imgC = safeCaptureScreen();
        if (imgC) {
            ft = isBubblePresent(imgC, CONFIG.bubble_FT[0], CONFIG.bubble_FT[1]);
            fb = isBubblePresent(imgC, CONFIG.bubble_FB[0], CONFIG.bubble_FB[1]);
            el = isBubblePresent(imgC, CONFIG.bubble_EL[0], CONFIG.bubble_EL[1]);
            er = isBubblePresent(imgC, CONFIG.bubble_ER[0], CONFIG.bubble_ER[1]);
            imgC.recycle();
        }
        runChickenFlow('force', ft, fb, el, er);
        clickSafeClose();
        pausableSleep(500);
    }
    if (PANEL.RANCH_ENABLED) {
        var r1 = false, r2 = false, chop = false;
        var imgR = safeCaptureScreen();
        if (imgR) {
            r1 = isBubblePresent(imgR, CONFIG.bubble_R1[0], CONFIG.bubble_R1[1]);
            r2 = isBubblePresent(imgR, CONFIG.bubble_R2[0], CONFIG.bubble_R2[1]);
            chop = isBubblePresent(imgR, CONFIG.bubble_CHOP[0], CONFIG.bubble_CHOP[1]);
            imgR.recycle();
        }
        runRanchFlow('force', r1, r2, chop);
        clickSafeClose();
        pausableSleep(500);
    }
}

// ================= 驿站出货与画面兜底 =================
CONFIG.stationGoodsCheckPoint = [2067, 910];
CONFIG.stationGoodsColor = [100, 166, 65];
CONFIG.stationGoodsColorTolerance = 25;
CONFIG.stationIcon = [2020, 965];
CONFIG.stationHarvestBtn = [2070, 975];
CONFIG.stationLoadBtn = [2070, 785];
CONFIG.stationScreenCheckPoint = [75, 115];
CONFIG.stationScreenColor = [96, 196, 196];
CONFIG.stationScreenColorTolerance = 25;

function checkStationHasGoods(img) {
    return regionHasColorNear(img, CONFIG.stationGoodsCheckPoint[0], CONFIG.stationGoodsCheckPoint[1], 15, CONFIG.stationGoodsColor, CONFIG.stationGoodsColorTolerance, 5);
}
function isOnStationScreen(img) {
    return regionHasColorNear(img, CONFIG.stationScreenCheckPoint[0], CONFIG.stationScreenCheckPoint[1], 15, CONFIG.stationScreenColor, CONFIG.stationScreenColorTolerance, 5);
}
function collectStationGoods() {
    log('[驿站] 开始收货流程');
    click(CONFIG.stationIcon[0], CONFIG.stationIcon[1]);
    sleepWithHeartbeat(3000);
    click(CONFIG.stationHarvestBtn[0], CONFIG.stationHarvestBtn[1]);
    sleepWithHeartbeat(3000);
    if (PANEL.STATION_LOAD_ENABLED) {
        click(CONFIG.stationLoadBtn[0], CONFIG.stationLoadBtn[1]);
        sleepWithHeartbeat(3000);
    }
    clickSafeClose();
    sleepWithHeartbeat(500);
    stationGoodsPending = false;
}
function handleStationScreenIfPresent() {
    while (true) {
        var img = safeCaptureScreen();
        if (!img) return;
        var onStation = isOnStationScreen(img);
        img.recycle();
        if (!onStation) return;
        collectStationGoods();
        exitToLobbyForDrift();
        reenterFarmFromLobby();
    }
}

// ================= 自动重连与偏移恢复 (FreezeRecovery) =================
CONFIG.exitGameBtn = [2222, 60];
CONFIG.HOME_TARGET_COLOR = [162, 119, 64];
CONFIG.HOME_TOLERANCE = 10;
CONFIG.HOME_CHECK_REGIONS = {
    "右上区域": { rect: [1850, 20, 460, 65], minPixels: 1000 },
    "左侧区域": { rect: [110, 180, 100, 520], minPixels: 1000 },
    "底部区域": { rect: [1275, 945, 875, 90], minPixels: 3000 }
};
CONFIG.disconnectDialogCheckRegion = [900, 300, 600, 100];
CONFIG.disconnectDialogUniformTolerance = 25;
CONFIG.disconnectDialogMinBrightness = 200;
CONFIG.disconnectDialogColorRef = [251, 244, 216];
CONFIG.disconnectDialogColorTolerance = 30;
CONFIG.disconnectDialogReconnectBtn = [1380, 670];
CONFIG.lobbyEnterListBtn = PANEL.LOBBY_ENTER_LIST_BTN;
CONFIG.lobbyEnterFarmBtn = PANEL.LOBBY_ENTER_FARM_BTN;
CONFIG.noticeBoardRecenterBtn = [1108, 1028];
CONFIG.sickleMenuRegion = [1100, 985, 240, 30];
CONFIG.sickleMenuRegionTolerance = 15;
CONFIG.sickleStateRegion = [1160, 816, 120, 80];
CONFIG.sickleStateTolerance = 18;

function saveFreezeDebugImg(label) {
    try {
        var img = safeCaptureScreen();
        if (!img) return;
        var ts = new java.text.SimpleDateFormat('yyyyMMdd_HHmmss_SSS').format(new Date());
        images.save(img, DEBUG_DIR + ts + '_freeze_' + label + '.png');
        img.recycle();
    } catch (e) {}
}

function checkIsHomeSingleFrame(img) {
    var matchCount = 0;
    var targetC = colors.rgb(CONFIG.HOME_TARGET_COLOR[0], CONFIG.HOME_TARGET_COLOR[1], CONFIG.HOME_TARGET_COLOR[2]);
    for (var key in CONFIG.HOME_CHECK_REGIONS) {
        var config = CONFIG.HOME_CHECK_REGIONS[key];
        var points = images.findAllPointsForColor(img, targetC, {
            region: config.rect,
            threshold: CONFIG.HOME_TOLERANCE
        });
        if (points && points.length >= config.minPixels) matchCount++;
    }
    return matchCount === 3;
}

function isDisconnectDialogShowing(img) {
    if (!isRegionUniform(img, CONFIG.disconnectDialogCheckRegion, CONFIG.disconnectDialogUniformTolerance)) return false;
    var avgC = regionAvgColor(img, CONFIG.disconnectDialogCheckRegion);
    var brightness = (avgC[0] + avgC[1] + avgC[2]) / 3;
    if (brightness < CONFIG.disconnectDialogMinBrightness) return false;
    var diffR = Math.abs(avgC[0] - CONFIG.disconnectDialogColorRef[0]);
    var diffG = Math.abs(avgC[1] - CONFIG.disconnectDialogColorRef[1]);
    var diffB = Math.abs(avgC[2] - CONFIG.disconnectDialogColorRef[2]);
    return Math.max(diffR, diffG, diffB) <= CONFIG.disconnectDialogColorTolerance;
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

function exitToLobbyForDrift() {
    var round = 0;
    while (round < 5) {
        round++;
        renewLock();
        click(CONFIG.exitGameBtn[0], CONFIG.exitGameBtn[1]);
        sleepWithHeartbeat(10000);
        var img = safeCaptureScreen();
        if (img) {
            if (checkIsHomeSingleFrame(img)) {
                randomDragScreen(300);
                sleepWithHeartbeat(1000);
                var imgConfirm = safeCaptureScreen();
                var confirmed = imgConfirm ? checkIsHomeSingleFrame(imgConfirm) : false;
                if (imgConfirm) imgConfirm.recycle();
                if (confirmed) {
                    img.recycle();
                    return true;
                }
            }
            img.recycle();
        }
    }
    return false;
}

function reenterFarmFromLobby() {
    while (true) {
        click(CONFIG.lobbyEnterListBtn[0], CONFIG.lobbyEnterListBtn[1]);
        sleepWithHeartbeat(10000);
        click(CONFIG.lobbyEnterFarmBtn[0], CONFIG.lobbyEnterFarmBtn[1]);
        sleepWithHeartbeat(10000);
        var img = safeCaptureScreen();
        var stillHome = false;
        if (img) {
            stillHome = checkIsHomeSingleFrame(img);
            img.recycle();
        }
        if (!stillHome) return;
    }
}

function clickReconnectAndConfirm() {
    while (true) {
        click(CONFIG.disconnectDialogReconnectBtn[0], CONFIG.disconnectDialogReconnectBtn[1]);
        sleepWithHeartbeat(10000);
        renewLock();
        var img = safeCaptureScreen();
        if (!img) continue;
        if (isDisconnectDialogShowing(img)) {
            img.recycle();
            continue;
        }
        var atLobby = false;
        if (checkIsHomeSingleFrame(img)) {
            randomDragScreen(300);
            sleepWithHeartbeat(1000);
            var imgConfirm = safeCaptureScreen();
            atLobby = imgConfirm ? checkIsHomeSingleFrame(imgConfirm) : false;
            if (imgConfirm) imgConfirm.recycle();
        }
        img.recycle();
        if (atLobby) reenterFarmFromLobby();
        return;
    }
}

function recenterAndDetectState() {
    handleStationScreenIfPresent();
    click(CONFIG.noticeBoardRecenterBtn[0], CONFIG.noticeBoardRecenterBtn[1]);
    sleepWithHeartbeat(5000);

    var imgA = safeCaptureScreen();
    var patchA = null;
    if (imgA) {
        patchA = images.clip(imgA, REF_REGION[0], REF_REGION[1], REF_REGION[2], REF_REGION[3]);
        imgA.recycle();
    }

    clickSafeClose();
    sleepWithHeartbeat(500);

    var imgBefore = safeCaptureScreen();
    var beforeSamples = imgBefore ? getRegionColorFingerprint(imgBefore) : null;
    if (imgBefore) imgBefore.recycle();

    clickCenterTile(CONFIG.CENTER_TILE[0], CONFIG.CENTER_TILE[1]);

    var elapsed = 0, popped = false;
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
        clickSafeClose();
        sleepWithHeartbeat(500);
        var imgChk = safeCaptureScreen();
        if (imgChk) {
            if (DriftGuard.matchReference(imgChk)) DriftGuard.refreshReference(imgChk);
            imgChk.recycle();
        }
        DriftGuard.reset();
        if (patchA) patchA.recycle();
        return { mode: 'harvest', menuAlreadyOpen: false };
    }

    sleep(350);
    var imgB = safeCaptureScreen();
    var sickleReady = true, sickleNow = false, recentered = false;
    if (imgB) {
        sickleReady = isRegionUniform(imgB, CONFIG.sickleStateRegion, CONFIG.sickleStateTolerance);
        sickleNow = sickleReady;
        if (patchA) {
            try {
                var searchRegion = [
                    Math.max(REF_REGION[0] - DRIFT_SEARCH_MARGIN, 0),
                    Math.max(REF_REGION[1] - DRIFT_SEARCH_MARGIN, 0),
                    REF_REGION[2] + DRIFT_SEARCH_MARGIN * 2,
                    REF_REGION[3] + DRIFT_SEARCH_MARGIN * 2
                ];
                recentered = !!findImage(imgB, patchA, { region: searchRegion, threshold: 0.85 });
            } catch (e) {}
        }
        if (recentered) DriftGuard.refreshReference(imgB);
        imgB.recycle();
    }
    if (patchA) patchA.recycle();
    return { mode: 'harvest', menuAlreadyOpen: true, sickleNow: sickleNow };
}

function handleFreezeRecovery(skipPhase1) {
    if (!skipPhase1) {
        for (var i = 1; i <= 3; i++) {
            randomDragScreen(300);
            sleepWithHeartbeat(1000);
            click(CONFIG.exitGameBtn[0], CONFIG.exitGameBtn[1]);
            sleepWithHeartbeat(10000);
            var img = safeCaptureScreen();
            if (!img) continue;
            if (checkIsHomeSingleFrame(img)) {
                randomDragScreen(300);
                sleepWithHeartbeat(1000);
                var imgConfirm = safeCaptureScreen();
                var confirmed = imgConfirm ? checkIsHomeSingleFrame(imgConfirm) : false;
                if (imgConfirm) imgConfirm.recycle();
                if (confirmed) {
                    img.recycle();
                    reenterFarmFromLobby();
                    return recenterAndDetectState();
                }
            }
            if (isDisconnectDialogShowing(img)) {
                img.recycle();
                clickReconnectAndConfirm();
                return recenterAndDetectState();
            }
            var stillMatchesRef = DriftGuard.matchReference(img);
            img.recycle();
            if (!stillMatchesRef) {
                var exitOk = exitToLobbyForDrift();
                if (exitOk) {
                    reenterFarmFromLobby();
                    return recenterAndDetectState();
                } else {
                    break;
                }
            }
        }
    }

    var waitRound = 0;
    while (true) {
        sleepWithHeartbeat(60000);
        waitRound++;
        renewLock();
        saveFreezeDebugImg('phase2_round' + waitRound);
        var img2 = safeCaptureScreen();
        if (!img2) continue;
        if (isDisconnectDialogShowing(img2)) {
            img2.recycle();
            clickReconnectAndConfirm();
            return recenterAndDetectState();
        }
        if (checkIsHomeSingleFrame(img2)) {
            randomDragScreen(300);
            sleepWithHeartbeat(1000);
            var imgConfirm2 = safeCaptureScreen();
            var confirmed2 = imgConfirm2 ? checkIsHomeSingleFrame(imgConfirm2) : false;
            if (imgConfirm2) imgConfirm2.recycle();
            if (confirmed2) {
                img2.recycle();
                reenterFarmFromLobby();
                return recenterAndDetectState();
            }
        }
        img2.recycle();
        click(CONFIG.exitGameBtn[0], CONFIG.exitGameBtn[1]);
    }
}

function recoverFromFreeze(reasonLabel, kind) {
    toastLog('触发自动重连恢复（' + reasonLabel + '），请勿操作手机');
    saveFreezeDebugImg(kind + '_start');
    var detectionResult;
    if (kind === 'drift') {
        var exitOk = exitToLobbyForDrift();
        if (exitOk) {
            reenterFarmFromLobby();
            detectionResult = recenterAndDetectState();
        } else {
            detectionResult = handleFreezeRecovery(true);
        }
    } else {
        detectionResult = handleFreezeRecovery(false);
    }
    var effMode = (detectionResult.mode === 'harvest' && plantDone) ? 'harvest' : 'plant';
    var menuOpen = detectionResult.menuAlreadyOpen;
    if (effMode === 'harvest') {
        if (!menuOpen || !detectionResult.sickleNow) {
            if (menuOpen) {
                clickSafeClose();
                sleepWithHeartbeat(500);
            }
            menuOpen = false;
        }
    }
    return { mode: effMode, menuAlreadyOpen: menuOpen };
}

// ================= 菜单弹出检测 =================
var menuRefColors = null;
function getRegionColorFingerprint(img) {
    return sampleRegionColors(img, CONFIG.sickleMenuRegion, 40, 10);
}
function hasMenuPopped(img) {
    if (!menuRefColors) return false;
    var currentSamples = sampleRegionColors(img, CONFIG.sickleMenuRegion, 40, 10);
    var diffCount = 0;
    for (var i = 0; i < currentSamples.length; i++) {
        var c1 = menuRefColors[i], c2 = currentSamples[i];
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
    } catch (e) {}
}

var CENTER_CLICK_RETRY_COUNT = 5;
function clickAndAwaitMenu(clickX, clickY, stepLabel) {
    for (var attempt = 1; attempt <= CENTER_CLICK_RETRY_COUNT; attempt++) {
        ensureCenterClean();
        var imgRef = safeCaptureScreen();
        if (imgRef) {
            menuRefColors = getRegionColorFingerprint(imgRef);
            imgRef.recycle();
        }
        clickCenterTile(clickX, clickY);
        var elapsed = 0, popped = false;
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
            return true;
        }
    }
    saveMenuMissDebugImg((stepLabel || 'tap') + '_freeze');
    toastLog('中心地菜单连续未弹出，自动重连恢复中…');
    var result = recoverFromFreeze(stepLabel + '-菜单未弹出', 'freeze');
    throw new RecoveredCycleSignal(result.mode, result.menuAlreadyOpen);
}

// ================= 仓库与变卖队列 =================
function handleWarehouseFullOrFallback(reasonLabel, atHarvest) {
    consecutiveWarehouseFullRecoveries++;
    if (consecutiveWarehouseFullRecoveries >= MAX_CONSECUTIVE_WAREHOUSE_FULL_RECOVERIES) {
        consecutiveWarehouseFullRecoveries = 0;
        clickSafeClose();
        sleepWithHeartbeat(500);
        var result = recoverFromFreeze('连续疑似爆仓误判(' + reasonLabel + ')', 'drift');
        throw new RecoveredCycleSignal(result.mode, result.menuAlreadyOpen);
    }
    toastLog('仓库已满弹窗，自动变卖挽救');
    handleWarehouseFullDuringHarvest();
    if (atHarvest) {
        bubbleDetectSuspended = true;
        throw new RestartCycleSignal();
    }
    resetAfterHarvest = true;
    sellsDoneThisRound = true;
}

function openWarehouse() {
    click(CONFIG.warehouseBtn[0], CONFIG.warehouseBtn[1]);
    pausableSleep(2000);
    click(CONFIG.warehouseConfirmBtn[0], CONFIG.warehouseConfirmBtn[1]);
    pausableSleep(800);
}
function closeWarehouseToField() {
    clickSafeClose();
    pausableSleep(500);
    click(CONFIG.returnToFieldBtn[0], CONFIG.returnToFieldBtn[1]);
    pausableSleep(1500);
    clickSafeClose();
    pausableSleep(500);
}

function slotOrderCompare(a, b) {
    var dy = a.slot[1] - b.slot[1];
    if (Math.abs(dy) > 100) return dy > 0 ? -1 : 1;
    return b.slot[0] - a.slot[0];
}
function cropSellItem(cropKey, times) {
    var c = CROPS[cropKey];
    return { label: c.label, slot: c.slot, btn: c.sellBtn, times: times, cropKey: cropKey, tag: null };
}
function eggSellItem() {
    return { label: '鸡蛋', slot: CONFIG.eggSlotInWarehouse, btn: CONFIG.eggSellBtn, times: 1, cropKey: null, tag: 'egg' };
}
function milkSellItem() {
    return { label: '马奶', slot: CONFIG.milkSlotInWarehouse, btn: CONFIG.milkSellBtn, times: 1, cropKey: null, tag: 'milk' };
}
function fertileWheatSellItem(times) {
    var c = CROPS.wheat;
    return { label: '良田小麦', slot: c.slot, btn: c.sellBtn, times: times, cropKey: null, tag: null };
}
function describeSellItems(items) {
    var parts = [];
    for (var i = 0; i < items.length; i++) parts.push(items[i].label + '×' + items[i].times);
    return parts.join(' → ');
}
function buildCropSellItems(sellList) {
    var items = [];
    if (!sellList) return items;
    for (var i = 0; i < sellList.length; i++) {
        var key = sellList[i][0], times = sellList[i][1];
        if (PANEL.SELL_ONLY_AFTER_HARVEST && !unsoldStock[key]) continue;
        items.push(cropSellItem(key, times));
    }
    return items;
}
function runSellQueue(items) {
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        for (var t = 0; t < it.times; t++) {
            click(it.slot[0], it.slot[1]);
            pausableSleep(500);
            click(it.btn[0], it.btn[1]);
            pausableSleep(500);
        }
        if (it.cropKey) unsoldStock[it.cropKey] = false;
        if (it.tag === 'egg') needSellEggs = false;
        if (it.tag === 'milk') needSellMilk = false;
    }
}
function runWarehouseSells(sellList, withEggsMilk, reason) {
    var items = buildCropSellItems(sellList);
    if (withEggsMilk && needSellEggs && CONFIG.eggSlotInWarehouse && CONFIG.eggSellBtn) {
        items.push(eggSellItem());
        if (PANEL.FERTILE_ENABLED && fertileLastPlantTime > 0 && PANEL.FERTILE_EXTRA_WHEAT_SELLS > 0) {
            items.push(fertileWheatSellItem(PANEL.FERTILE_EXTRA_WHEAT_SELLS));
        }
    }
    if (withEggsMilk && needSellMilk && CONFIG.milkSlotInWarehouse && CONFIG.milkSellBtn) items.push(milkSellItem());
    if (items.length === 0) return;
    items.sort(slotOrderCompare);
    warehouseTripCount++;
    log('[仓库] 第' + warehouseTripCount + '趟（' + (reason || '卖货') + '）：' + describeSellItems(items));
    openWarehouse();
    runSellQueue(items);
    closeWarehouseToField();
    if (!needSellEggs && !needSellMilk) pendingSellSince = 0;
}
function sellEggsMilkTrip() {
    runWarehouseSells([], true, '卖鸡蛋/马奶');
}
function handleWarehouseFullDuringHarvest() {
    click(CONFIG.warehouseFullCloseBtn[0], CONFIG.warehouseFullCloseBtn[1]);
    pausableSleep(800);
    var items = [];
    if (PANEL.CHICKEN_ENABLED && CONFIG.eggSlotInWarehouse && CONFIG.eggSellBtn) items.push(eggSellItem());
    if (PANEL.RANCH_ENABLED && CONFIG.milkSlotInWarehouse && CONFIG.milkSellBtn) items.push(milkSellItem());
    for (var k = 0; k < OVERFLOW_SELLS.length; k++) {
        items.push(cropSellItem(OVERFLOW_SELLS[k][0], OVERFLOW_SELLS[k][1]));
    }
    items.sort(slotOrderCompare);
    warehouseTripCount++;
    log('[仓库] 第' + warehouseTripCount + '趟（爆仓变卖）：' + describeSellItems(items));
    openWarehouse();
    runSellQueue(items);
    closeWarehouseToField();
    for (var ck in unsoldStock) unsoldStock[ck] = false;
    pendingSellSince = 0;
}

// ================= [良田] 小麦流程 =================
function fertilePlantWheat() {
    var icon = PARAMS.wheat.icon, ct = CONFIG.CENTER_TILE, pts = [];
    for (var i = 0; i < FERTILE.HOLD_PTS; i++) pts.push(icon);
    pts = pts.concat(generateLine(icon, ct, FERTILE.MOVE_STEPS));
    for (var j = 0; j < 4; j++) pts.push(ct);
    var duration = Math.max(pts.length * FERTILE.MS_PER_PT, 500);
    gesture.apply(null, [duration].concat(pts));
}
function fertileDue() {
    if (!PANEL.FERTILE_ENABLED || CTRL.settingsOpen || CTRL.paused) return false;
    if (fertileLastPlantTime === 0) return true;
    return Date.now() - fertileLastPlantTime >= PANEL.FERTILE_INTERVAL_SEC * 1000;
}
function runFertileFlow(reason) {
    beginAction();
    log('[良田] 开始（' + reason + '）');
    click(FERTILE.ENTER_BTN[0], FERTILE.ENTER_BTN[1]);
    pausableSleep(FERTILE.ENTER_WAIT_MS);
    for (var i = 0; i < 3; i++) {
        click(CONFIG.CENTER_TILE[0], CONFIG.CENTER_TILE[1]);
        if (i < 2) sleep(FERTILE.TRIPLE_GAP_MS);
    }
    sleep(FERTILE.AFTER_TRIPLE_MS);
    fertilePlantWheat();
    fertileLastPlantTime = Date.now();
    if (cornDue()) {
        runCornFlow();
        return;
    }
    click(FERTILE.BACK_BTN[0], FERTILE.BACK_BTN[1]);
    pausableSleep(FERTILE.BACK_WAIT_MS);
    clickSafeClose();
    pausableSleep(500);
}

// ================= [上方新田地] 玉米流程 =================
var CORN = {
    ENTER_BTN: [2036, 160],
    ENTER_WAIT_MS: 1000,
    BACK_BTN: [1426, 1052],
    BACK_WAIT_MS: 1000,
    INTERVAL_SEC: 3600,
    SEED_ICON: [1480, 910],
    HARVEST_FIRST: 1,
    SELL_TIMES: 1,
    SLOT: [1580, 320],
    SELL_BTN: [1580, 785]
};
var CORN_FIELD = {
    CENTER: [1200, 540],
    P1: [882, 467],
    P2: [1530, 150],
    P3: [1745, 150],
    P4: [2172, 364],
    P5: [1845, 532],
    CLEAN_SPOT: [770, 510],
    SLOPE: -0.5
};
var CORN_SWEEP = {
    rows: 6,
    speed: 0.5,
    ORIG_PX_PER_PT: 63,
    POINT_MS: 25,
    HOLD_PTS: 7,
    WARMUP_CIRCLES: 3,
    WARMUP_RADIUS: 25,
    WARMUP_PTS: 10,
    SETTLE_PTS: 4,
    menuWaitMs: 700
};
var cornLastPlantTime = 0;

function cornCOf(p) { return p[1] - CORN_FIELD.SLOPE * p[0]; }
function cornBandEnds(c) {
    var S = CORN_FIELD.SLOPE;
    var P1 = CORN_FIELD.P1, P3 = CORN_FIELD.P3, P4 = CORN_FIELD.P4, P5 = CORN_FIELD.P5;
    var mB = (P5[1] - P1[1]) / (P5[0] - P1[0]);
    var mR = (P4[1] - P3[1]) / (P4[0] - P3[0]);
    var xl = (c - P1[1] + mB * P1[0]) / (mB - S);
    var yl = c + S * xl;
    var xr = (c - P3[1] + mR * P3[0]) / (mR - S);
    var yr = c + S * xr;
    if (yr < P3[1]) {
        yr = P3[1];
        xr = (yr - c) / S;
    }
    return { L: [Math.round(xl), Math.round(yl)], R: [Math.round(xr), Math.round(yr)] };
}
function cornBuildWaypoints(rows) {
    var wps = [CORN_FIELD.CENTER, CORN_FIELD.P1, CORN_FIELD.P2, CORN_FIELD.P3];
    var cStart = cornCOf(CORN_FIELD.P3);
    var cEnd = (cornCOf(CORN_FIELD.P4) + cornCOf(CORN_FIELD.P5)) / 2;
    var n = Math.max(2, rows - 1);
    var goingLeft = true;
    for (var i = 0; i < n; i++) {
        var c = cStart + (cEnd - cStart) * i / (n - 1);
        var e = cornBandEnds(c);
        if (goingLeft) { wps.push(e.R); wps.push(e.L); }
        else { wps.push(e.L); wps.push(e.R); }
        goingLeft = !goingLeft;
    }
    wps.push(CORN_FIELD.CENTER);
    return wps;
}
function cornSampleWaypoints(wps, stepPx) {
    var out = [];
    for (var i = 1; i < wps.length; i++) {
        var a = wps[i - 1], b = wps[i];
        var d = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
        if (d < 1) continue;
        var n = Math.max(1, Math.round(d / stepPx));
        for (var k = 1; k <= n; k++) {
            out.push([
                Math.round(a[0] + (b[0] - a[0]) * k / n),
                Math.round(a[1] + (b[1] - a[1]) * k / n)
            ]);
        }
    }
    return out;
}
function cornBuildGesturePoints(iconPt) {
    var pts = [];
    for (var i = 0; i < CORN_SWEEP.HOLD_PTS; i++) pts.push(iconPt);
    var warm = circlePoints(CORN_FIELD.CENTER, CORN_SWEEP.WARMUP_RADIUS, CORN_SWEEP.WARMUP_PTS);
    for (var k = 0; k < CORN_SWEEP.WARMUP_CIRCLES; k++) pts = pts.concat(warm);
    for (var j = 0; j < CORN_SWEEP.SETTLE_PTS; j++) pts.push(CORN_FIELD.CENTER);
    var stepPx = CORN_SWEEP.ORIG_PX_PER_PT * CORN_SWEEP.speed;
    pts = pts.concat(cornSampleWaypoints(cornBuildWaypoints(CORN_SWEEP.rows), stepPx));
    return pts;
}
function cornDue() {
    if (!PANEL.CORN_ENABLED) return false;
    if (cornLastPlantTime === 0) return true;
    return Date.now() - cornLastPlantTime >= CORN.INTERVAL_SEC * 1000;
}
function cornSweep(kind) {
    var isPlant = (kind === 'plant');
    toastLog(isPlant ? "== 播种上方玉米 ==" : "== 收割上方玉米 ==");
    click(CORN_FIELD.CLEAN_SPOT[0], CORN_FIELD.CLEAN_SPOT[1]);
    pausableSleep(400);
    click(CORN_FIELD.CENTER[0], CORN_FIELD.CENTER[1]);
    pausableSleep(CORN_SWEEP.menuWaitMs);
    var icon = isPlant ? CORN.SEED_ICON : CONFIG.sickleIcon;
    var pts = cornBuildGesturePoints(icon);
    var duration = Math.max(pts.length * CORN_SWEEP.POINT_MS, 500);
    gesture.apply(null, [duration].concat(pts));
    if (isPlant) cornLastPlantTime = Date.now();
    pausableSleep(500);
    click(CORN_FIELD.CLEAN_SPOT[0], CORN_FIELD.CLEAN_SPOT[1]);
    pausableSleep(500);
}
function sellCornTrip() {
    var items = [{ label: '玉米', slot: CORN.SLOT, btn: CORN.SELL_BTN, times: CORN.SELL_TIMES, cropKey: null, tag: null }];
    warehouseTripCount++;
    log('[仓库] 第' + warehouseTripCount + '趟（卖上方玉米）：' + describeSellItems(items));
    openWarehouse();
    runSellQueue(items);
    closeWarehouseToField();
}
function runCornFlow() {
    var hadCorn = cornLastPlantTime > 0;
    click(CORN.ENTER_BTN[0], CORN.ENTER_BTN[1]);
    pausableSleep(CORN.ENTER_WAIT_MS);
    if (hadCorn && CORN.HARVEST_FIRST) cornSweep('harvest');
    cornSweep('plant');
    click(CORN.BACK_BTN[0], CORN.BACK_BTN[1]);
    pausableSleep(CORN.BACK_WAIT_MS);
    clickSafeClose();
    pausableSleep(500);
    if (hadCorn) sellCornTrip();
}

// ================= 主田种收与等待巡检 =================
function plantAll(cropKey, menuAlreadyOpen) {
    CTRL.currentPhase = 'plant';
    currentCrop = cropKey;
    lastPlantTime = Date.now();
    plantDone = false;

    if (!menuAlreadyOpen) {
        clickAndAwaitMenu(CONFIG.targetTile[0], CONFIG.targetTile[1], 'plant');
    }

    toastLog("== 播种" + CROPS[cropKey].label + " ==");
    dragFarmLoop(CROPS[cropKey].plantKey);
    plantDone = true;
    pausableSleep(500);
    var driftResult = DriftGuard.softCheck('plant');
    if (driftResult === 'warehouseFull') {
        handleWarehouseFullOrFallback('plant-softCheck', false);
    } else if (driftResult === 'suspected') {
        pausableSleep(1000);
        var confirmResult = DriftGuard.finalCheck('plant_immediate');
        if (confirmResult === 'drift') {
            var result = recoverFromFreeze('plant种植后偏移', 'drift');
            throw new RecoveredCycleSignal(result.mode, result.menuAlreadyOpen);
        } else if (confirmResult === 'warehouseFull') {
            handleWarehouseFullOrFallback('plant-immediate', false);
        }
    }
}

function flushEggMilkIfDue() {
    if (!needSellEggs && !needSellMilk) {
        pendingSellSince = 0;
        return;
    }
    if (pendingSellSince === 0) pendingSellSince = Date.now();
    var eggSettled = !PANEL.CHICKEN_ENABLED || needSellEggs;
    var milkSettled = !PANEL.RANCH_ENABLED || needSellMilk;
    var waitedMs = Date.now() - pendingSellSince;
    if ((eggSettled && milkSettled) || waitedMs >= PANEL.EGG_MILK_BATCH_WAIT_SEC * 1000) {
        sellEggsMilkTrip();
    }
}

function bubbleTick() {
    if (bubbleDetectSuspended || bubbleFlowActive || CTRL.settingsOpen) return;
    var r1 = checkAndRunFarmTasks();
    var r2 = (r1 === 'none') ? checkAndRunRanchTasks() : 'none';
    if (r1 !== 'none' || r2 !== 'none') {
        clickSafeClose();
        pausableSleep(500);
        if (r1 === 'grab' || r2 === 'grab') {
            resetAfterHarvest = true;
            toastLog('触发抢收，本轮作物收完后优先补种小麦/水稻');
        }
    }
    flushEggMilkIfDue();
}

function isSickleMenuShowing(img) {
    return isRegionUniform(img, CONFIG.sickleStateRegion, CONFIG.sickleStateTolerance);
}
function waitMenuPopped(timeoutMs) {
    var elapsed = 0;
    while (elapsed < timeoutMs) {
        sleep(200);
        elapsed += 200;
        renewLock();
        var imgNow = safeCaptureScreen();
        if (imgNow) {
            var popped = hasMenuPopped(imgNow);
            imgNow.recycle();
            if (popped) return true;
        }
    }
    return false;
}
function openMenuForHarvest(readyAt) {
    if (!PANEL.SICKLE_CHECK_ENABLED) {
        clickAndAwaitMenu(CONFIG.targetTile[0], CONFIG.targetTile[1], 'harvest');
        return;
    }
    var fallbackAt = Math.max(readyAt, Date.now()) + PANEL.SICKLE_POLL_MAX_SEC * 1000;
    while (true) {
        renewLock();
        clickSafeClose();
        sleep(300);
        var imgRef = safeCaptureScreen();
        if (imgRef) {
            menuRefColors = getRegionColorFingerprint(imgRef);
            imgRef.recycle();
        }
        clickCenterTile(CONFIG.targetTile[0], CONFIG.targetTile[1]);
        if (waitMenuPopped(3000)) {
            sleep(350);
            var imgS = safeCaptureScreen();
            var sickle = true;
            if (imgS) {
                sickle = isSickleMenuShowing(imgS);
                imgS.recycle();
            }
            if (sickle) return;
        }
        if (Date.now() >= fallbackAt) {
            saveMenuMissDebugImg('sickle_timeout');
            clickAndAwaitMenu(CONFIG.targetTile[0], CONFIG.targetTile[1], 'harvest');
            return;
        }
        pausableSleep(3000);
    }
}

function waitReadyAndHarvest(forceNow) {
    CTRL.currentPhase = 'wait';
    bubbleFlowActive = false;
    chickenPartialSince = 0;
    ranchPartialSince = 0;
    var crop = CROPS[currentCrop];
    var readyAt = forceNow
        ? Date.now()
        : (lastPlantTime + crop.cooldownSec * 1000 + CONFIG.readyBufferMs);

    clickSafeClose();
    pausableSleep(500);
    log('[等待] ' + crop.label + ' 剩余约 ' + Math.max(0, Math.round((readyAt - Date.now()) / 1000)) + ' 秒');

    if (forceFlowsPending && Date.now() < readyAt) {
        runForcedFlows();
        forceFlowsPending = false;
    }

    var pollMs = Math.max(1, PANEL.BUBBLE_POLL_SEC) * 1000;
    var stopMs = Math.max(0, PANEL.BUBBLE_STOP_BEFORE_READY_SEC) * 1000;
    while (Date.now() < readyAt) {
        setActionInProgress(false);
        var remain = readyAt - Date.now();
        if (remain <= stopMs) {
            pausableSleep(remain);
            break;
        }
        pausableSleep(Math.min(pollMs, remain - stopMs));
        if (readyAt - Date.now() <= stopMs) continue;
        bubbleTick();
        if (readyAt - Date.now() > stopMs && fertileDue()) runFertileFlow('定时');
    }

    beginAction();
    CTRL.currentPhase = 'harvest';
    openMenuForHarvest(readyAt);
    harvestAll(true);
}

function harvestAll(menuAlreadyOpen) {
    CTRL.currentPhase = 'harvest';
    if (!menuAlreadyOpen) {
        clickAndAwaitMenu(CONFIG.targetTile[0], CONFIG.targetTile[1], 'harvest');
    }
    dragFarmLoop(CROPS[currentCrop].harvestKey);
    unsoldStock[currentCrop] = true;
    pausableSleep(500);
    var result = DriftGuard.finalCheck('harvest');
    if (result === 'ok') {
        consecutiveWarehouseFullRecoveries = 0;
        if (bubbleDetectSuspended) bubbleDetectSuspended = false;
        var imgStation = safeCaptureScreen();
        if (imgStation) {
            if (checkStationHasGoods(imgStation)) stationGoodsPending = true;
            imgStation.recycle();
        }
        return;
    }
    if (result === 'warehouseFull') {
        handleWarehouseFullOrFallback('harvest', true);
        return;
    }
    var result2 = recoverFromFreeze('harvest收割后确认偏移', 'drift');
    throw new RecoveredCycleSignal(result2.mode, result2.menuAlreadyOpen);
}

function getDisplayCycleNum() {
    var baseCycle = SCHEDULE[roundIdx] ? SCHEDULE[roundIdx].cycle : 1;
    return baseCycle >= 9 ? (9 + totalLoopsAfter9) : baseCycle;
}

function advanceRound() {
    sellsDoneThisRound = false;
    if (resetAfterHarvest) {
        resetAfterHarvest = false;
        roundIdx = getCurrentCycleStartIdx(roundIdx);
        log('[轮种] 触发缺料补种，切入第' + getDisplayCycleNum() + '次循环小麦轮');
    } else if (roundIdx + 1 >= SCHEDULE.length) {
        roundIdx = SCHEDULE_LOOP_START_IDX;
        totalLoopsAfter9++;
        log('[轮种] 进入第' + getDisplayCycleNum() + '次循环（2玉米→1小麦→1水稻）');
    } else {
        roundIdx = roundIdx + 1;
    }
}

// ================= 暂停恢复与校准 UI =================
function handlePauseAndResume() {
    setActionInProgress(false);
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
            pausableSleep(10000);
            refreshDriftReference();
            skipWaitOnce = true;
            skipToHarvestOnce = true;
        } else {
            toastLog('10秒后开始种植，请确保已回到中心基准地');
            pausableSleep(10000);
            clickSafeClose();
            pausableSleep(500);
            refreshDriftReference();
            skipToHarvestOnce = false;
        }
    } catch (e2) {
        if (e2 instanceof PauseSignal) handlePauseAndResume();
        else throw e2;
    }
}

function waitForLandscape() {
    if (device.width < device.height) {
        toastLog("请切回游戏，保持横屏");
        while (device.width < device.height) sleep(500);
        sleep(1500);
    }
}
function calibratePoint(promptText) {
    waitForLandscape();
    sleep(300);
    var realW = device.width, realH = device.height;
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
    var sx, sy, srx, sry, absoluteX = realW / 2, absoluteY = realH / 2;
    marker.root.setOnTouchListener(function (view, event) {
        switch (event.getAction()) {
            case event.ACTION_DOWN:
                sx = marker.getX(); sy = marker.getY();
                srx = event.getRawX(); sry = event.getRawY();
                break;
            case event.ACTION_MOVE:
                marker.setPosition(sx + (event.getRawX() - srx), sy + (event.getRawY() - sry));
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
        result = [Math.round((absoluteX / screenW) * 2412), Math.round((absoluteY / screenH) * 1080)];
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
        var ok = dialogs.confirm("刚才自动点的位置准不准？", "核对坐标：" + pos[0] + "," + pos[1]);
        if (ok) return pos;
        toastLog("重新校准这个点");
    }
}

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
    if (ctrlWin) ctrlWin.panel.post(function () { ctrlWin.panel.setVisibility(8); });
}
function syncSettingsPanelToState() {
    if (PANEL.FERTILE_ENABLED) setToggleOn(ctrlWin.fertileTgl); else setToggleOff(ctrlWin.fertileTgl);
    if (PANEL.CORN_ENABLED) setToggleOn(ctrlWin.cornTgl); else setToggleOff(ctrlWin.cornTgl);
    if (PANEL.CHICKEN_ENABLED) {
        setToggleOn(ctrlWin.chickenTgl);
        ctrlWin.cp1Val.post(function () { ctrlWin.cp1Val.setText("" + PANEL.FACTORY_FEED_PULLS); });
        setRowVisible(ctrlWin.cp1Row, true);
    } else {
        setToggleOff(ctrlWin.chickenTgl);
        setRowVisible(ctrlWin.cp1Row, false);
    }
    if (PANEL.RANCH_ENABLED) {
        setToggleOn(ctrlWin.ranchTgl);
        ctrlWin.rp1Val.post(function () { ctrlWin.rp1Val.setText("" + PANEL.CHOP_FEED_PULLS); });
        setRowVisible(ctrlWin.rp1Row, true);
    } else {
        setToggleOff(ctrlWin.ranchTgl);
        setRowVisible(ctrlWin.rp1Row, false);
    }
    if (PANEL.STATION_LOAD_ENABLED) setToggleOn(ctrlWin.stationLoadTgl); else setToggleOff(ctrlWin.stationLoadTgl);
}
function showResumeChoiceDialog() {
    var actionClicked = null;
    var dlg = dialogs.build({
        title: "继续后，下一步做什么？",
        content: "请选择恢复后要执行的动作，选“取消”则保持暂停",
        positive: "种植",
        negative: "收割",
        neutral: "取消"
    }).on("any", function (action) {
        actionClicked = action;
    });
    dlg.show();
    while (actionClicked == null) sleep(100);
    if (actionClicked !== "positive" && actionClicked !== "negative") return;
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
                    <text text="良田" textColor="#E0E0E0" textSize="12sp" w="0" layout_weight="1" gravity="left|center_vertical"/>
                    <text id="fertileTgl" text=" 开 " textColor="#FFFFFF" textSize="11sp" bg="#4CAF50" padding="8" gravity="center"/>
                </horizontal>
                <horizontal w="match_parent" h="30" gravity="center_vertical" marginTop="3">
                    <text text="玉米" textColor="#E0E0E0" textSize="12sp" w="0" layout_weight="1" gravity="left|center_vertical"/>
                    <text id="cornTgl" text=" 开 " textColor="#FFFFFF" textSize="11sp" bg="#4CAF50" padding="8" gravity="center"/>
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
                <horizontal w="match_parent" h="30" gravity="center_vertical" marginTop="3">
                    <text text="驿站装载" textColor="#E0E0E0" textSize="12sp" w="0" layout_weight="1" gravity="left|center_vertical"/>
                    <text id="stationLoadTgl" text=" 关 " textColor="#FFFFFF" textSize="11sp" bg="#666666" padding="8" gravity="center"/>
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
                ctrlWin.setPosition(sx + (event.getRawX() - srx), sy + (event.getRawY() - sry));
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
            threads.start(function () { showResumeChoiceDialog(); });
        } else {
            CTRL.paused = true;
            ctrlWin.ppBtn.post(function () { ctrlWin.ppBtn.setText(" ▶ "); });
            toastLog("动作已暂停");
        }
    });
    ctrlWin.fertileTgl.click(function () {
        PANEL.FERTILE_ENABLED = PANEL.FERTILE_ENABLED ? 0 : 1;
        if (PANEL.FERTILE_ENABLED) setToggleOn(ctrlWin.fertileTgl); else setToggleOff(ctrlWin.fertileTgl);
    });
    ctrlWin.cornTgl.click(function () {
        PANEL.CORN_ENABLED = PANEL.CORN_ENABLED ? 0 : 1;
        if (PANEL.CORN_ENABLED) setToggleOn(ctrlWin.cornTgl); else setToggleOff(ctrlWin.cornTgl);
    });
    ctrlWin.chickenTgl.click(function () {
        if (PANEL.CHICKEN_ENABLED) {
            threads.start(function () {
                if (!dialogs.confirm("确定关闭鸡场流程吗？")) return;
                PANEL.CHICKEN_ENABLED = 0;
                setToggleOff(ctrlWin.chickenTgl);
                setRowVisible(ctrlWin.cp1Row, false);
            });
        } else {
            threads.start(function () {
                if (!chickenCalibrated) {
                    forceCloseSettingsPanel();
                    CTRL.paused = true;
                    ctrlWin.ppBtn.post(function () { ctrlWin.ppBtn.setText(" ▶ "); });
                    sleep(600);
                    CONFIG.eggSlotInWarehouse = calibrateAndVerify("打开仓库，把红十字拖到鸡蛋图标上，再点\"确定这里\"");
                    CONFIG.eggSellBtn = calibrateAndVerify("点一下鸡蛋弹出详情，把红十字拖到\"出售\"按钮上，再点\"确定这里\"");
                    chickenCalibrated = true;
                    calibStorage.put('eggSlot', CONFIG.eggSlotInWarehouse);
                    calibStorage.put('eggBtn', CONFIG.eggSellBtn);
                    calibStorage.put('chickenCalibrated', true);
                }
                PANEL.CHICKEN_ENABLED = 1;
                setToggleOn(ctrlWin.chickenTgl);
                ctrlWin.cp1Val.post(function () { ctrlWin.cp1Val.setText("" + PANEL.FACTORY_FEED_PULLS); });
                setRowVisible(ctrlWin.cp1Row, true);
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
    ctrlWin.ranchTgl.click(function () {
        if (PANEL.RANCH_ENABLED) {
            threads.start(function () {
                if (!dialogs.confirm("确定关闭马场流程吗？")) return;
                PANEL.RANCH_ENABLED = 0;
                setToggleOff(ctrlWin.ranchTgl);
                setRowVisible(ctrlWin.rp1Row, false);
            });
        } else {
            threads.start(function () {
                if (!ranchCalibrated) {
                    forceCloseSettingsPanel();
                    CTRL.paused = true;
                    ctrlWin.ppBtn.post(function () { ctrlWin.ppBtn.setText(" ▶ "); });
                    sleep(600);
                    CONFIG.milkSlotInWarehouse = calibrateAndVerify("打开仓库，把红十字拖到马奶图标上，再点\"确定这里\"");
                    CONFIG.milkSellBtn = calibrateAndVerify("点一下马奶弹出详情，把红十字拖到\"出售\"按钮上，再点\"确定这里\"");
                    ranchCalibrated = true;
                    calibStorage.put('milkSlot', CONFIG.milkSlotInWarehouse);
                    calibStorage.put('milkBtn', CONFIG.milkSellBtn);
                    calibStorage.put('ranchCalibrated', true);
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
    ctrlWin.stationLoadTgl.click(function () {
        PANEL.STATION_LOAD_ENABLED = PANEL.STATION_LOAD_ENABLED ? 0 : 1;
        if (PANEL.STATION_LOAD_ENABLED) setToggleOn(ctrlWin.stationLoadTgl); else setToggleOff(ctrlWin.stationLoadTgl);
    });
    syncSettingsPanelToState();
}

// ================= 启动流程 =================
try {
    var __testWin = floaty.window(<text text="."/>);
    __testWin.close();
} catch (e) {
    toastLog("没有悬浮窗权限，请开启后重试");
    releaseLock(); exit();
}
toastLog("即将请求截屏权限，请点击允许");
var checkPermission = false;
try { checkPermission = requestScreenCapture(); } catch (e) {}
if (!checkPermission) {
    toastLog("你取消了截屏权限，脚本已终止。");
    releaseLock(); exit();
}
sleep(1000);
if (chickenCalibrated || ranchCalibrated) {
    var keepCalib = dialogs.confirm("发现历史坐标", "是否继续使用上次保存的鸡蛋/马奶位置？\n【确定】直接使用\n【取消】重新校准");
    if (!keepCalib) {
        calibStorage.clear();
        chickenCalibrated = false;
        ranchCalibrated = false;
        sleep(500);
    }
}
if (PANEL.CHICKEN_ENABLED && !chickenCalibrated) {
    CONFIG.eggSlotInWarehouse = calibrateAndVerify("打开仓库，把红十字拖到鸡蛋图标上，再点\"确定这里\"");
    CONFIG.eggSellBtn = calibrateAndVerify("点一下鸡蛋弹出详情，把红十字拖到\"出售\"按钮上，再点\"确定这里\"");
    chickenCalibrated = true;
    calibStorage.put('eggSlot', CONFIG.eggSlotInWarehouse);
    calibStorage.put('eggBtn', CONFIG.eggSellBtn);
    calibStorage.put('chickenCalibrated', true);
}
if (PANEL.RANCH_ENABLED && !ranchCalibrated) {
    CONFIG.milkSlotInWarehouse = calibrateAndVerify("打开仓库，把红十字拖到马奶图标上，再点\"确定这里\"");
    CONFIG.milkSellBtn = calibrateAndVerify("点一下马奶弹出详情，把红十字拖到\"出售\"按钮上，再点\"确定这里\"");
    ranchCalibrated = true;
    calibStorage.put('milkSlot', CONFIG.milkSlotInWarehouse);
    calibStorage.put('milkBtn', CONFIG.milkSellBtn);
    calibStorage.put('ranchCalibrated', true);
}

(function validateSchedule() {
    for (var i = 0; i < SCHEDULE.length; i++) {
        var r = SCHEDULE[i], bad = !CROPS[r.crop] ? r.crop : null;
        for (var j = 0; !bad && r.sells && j < r.sells.length; j++) {
            if (!CROPS[r.sells[j][0]]) bad = r.sells[j][0];
        }
        if (bad) {
            toastLog("轮种表第" + (i + 1) + "轮作物名错误：" + bad);
            releaseLock(); exit();
        }
    }
})();

toastLog("10秒内切回游戏摆好镜头！");
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

// ================= 主循环 =================
while (true) {
    try {
        renewLock();
        setActionInProgress(true);
        var round = SCHEDULE[roundIdx];
        var dispCycle = getDisplayCycleNum();
        if (skipToHarvestOnce) {
            skipToHarvestOnce = false;
            var menuOpenH = pendingMenuAlreadyOpen;
            pendingMenuAlreadyOpen = false;
            var forceNow = skipWaitOnce;
            skipWaitOnce = false;
            if (menuOpenH) {
                beginAction();
                harvestAll(true);
            } else {
                waitReadyAndHarvest(forceNow);
            }
        } else {
            DriftGuard.reset();
            log('===== 第' + dispCycle + '次循环（表第' + (roundIdx + 1) + '/' + SCHEDULE.length + '轮） 种' + CROPS[round.crop].label + ' =====');
            var menuAlreadyOpenP = pendingMenuAlreadyOpen;
            pendingMenuAlreadyOpen = false;
            plantAll(round.crop, menuAlreadyOpenP);
            if (!sellsDoneThisRound) {
                if (round.keepStock) {
                    for (var ks = 0; ks < round.keepStock.length; ks++) {
                        unsoldStock[round.keepStock[ks]] = false;
                        log('[轮种] ' + CROPS[round.keepStock[ks]].label + ' 本轮留存不卖');
                    }
                }
                runWarehouseSells(round.sells, true, '第' + dispCycle + '次循环种完卖货');
                sellsDoneThisRound = true;
            }
            clickSafeClose();
            pausableSleep(500);
            if (stationGoodsPending) collectStationGoods();
            var midResult = DriftGuard.midFlowRecheck();
            if (midResult === 'drift') {
                var midDetection = recoverFromFreeze('midflow确认偏移', 'drift');
                throw new RecoveredCycleSignal(midDetection.mode, midDetection.menuAlreadyOpen);
            } else if (midResult === 'warehouseFull') {
                handleWarehouseFullOrFallback('midflow', false);
            }
            if (fertileDue()) runFertileFlow('种完回中后');
            waitReadyAndHarvest(false);
        }
        advanceRound();
    } catch (e) {
        bubbleFlowActive = false;
        if (e instanceof PauseSignal) {
            handlePauseAndResume();
        } else if (e instanceof RestartCycleSignal) {
            roundIdx = getCurrentCycleStartIdx(roundIdx);
            sellsDoneThisRound = false;
            resetAfterHarvest = false;
            skipToHarvestOnce = false;
            skipWaitOnce = false;
            pendingMenuAlreadyOpen = false;
        } else if (e instanceof RecoveredCycleSignal) {
            skipToHarvestOnce = (e.mode === 'harvest');
            pendingMenuAlreadyOpen = e.menuAlreadyOpen;
            bubbleDetectSuspended = true;
            forceFlowsPending = true;
        } else {
            toastLog("主循环异常：" + (e && e.message ? e.message : e));
            sleep(3000);
        }
    }
}
