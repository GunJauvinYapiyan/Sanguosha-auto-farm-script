// Auto火力种田王 刷经验轮种改版（小麦/水稻/大豆/甘蔗）
// 提示：请将悬浮窗置于左上人物名片处，不要放太靠左上角，会遮挡水域影响驿站定位检测；也不要放在会遮挡主页界面金属色UI的地方，会影响主页检测。

auto.waitFor();
floaty.closeAll();

// ============================================================
// ============ 控制面板：改这里的数就行，下面自动变化 ============
// ============================================================
var PANEL = {
    POTION_STARTUP_PROMPT: 0,      // 0=关闭启动时的加速酒弹窗，1=开启（关闭后，仍可随时通过悬浮窗齿轮设置开启加速酒）
    WHEAT_COOLDOWN_SEC: 120,       // 小麦成熟秒数
    RICE_COOLDOWN_SEC: 300,        // 水稻成熟秒数
    SOY_COOLDOWN_SEC: 600,         // 大豆成熟秒数
    CANE_COOLDOWN_SEC: 1800,       // 甘蔗成熟秒数
    FACTORY_FEED_PULLS: 5,         // 中间两个铡刀坊（鸡场）各自的拖拽次数，默认5，对应鸡饲料x2
    CHOP_FEED_PULLS: 6,            // 下面铡刀坊（马场）的拖拽次数，默认6，对应马饲料x2
    CHICKEN_ENABLED: 1,            // 1=开启鸡场流程，0=关闭
    RANCH_ENABLED: 1,              // 1=开启马场流程，0=关闭
    STATION_LOAD_ENABLED: 0,        // 1=驿站收货时顺带点装载，0=只收货不装载
    BUBBLE_POLL_SEC: 5,            // 等待作物成熟期间，每隔几秒检测一次鸡场/马场气泡
    BUBBLE_STOP_BEFORE_READY_SEC: 20, // 距离成熟计时点还剩几秒时，停止气泡检测（避免刚好卡在收割前进入鸡场/马场流程）
    PARTIAL_GRACE_SEC: 30,         // 气泡只出现一部分时，最多等几秒还不齐就抢收（抢收=判定饲料缺了，本轮收完后回到第1轮）
    SICKLE_CHECK_ENABLED: 0,
    SICKLE_POLL_MAX_SEC: 90,       // 到点后最多再等几秒还检测不到镰刀，就放弃镰刀检测，走原来的点中心地流程
    SELL_ONLY_AFTER_HARVEST: 1,    // [改] 1=某作物必须"收上来、且收完后还没卖过"才会去卖（开局第1轮不卖还没收的水稻/甘蔗；重置回第1轮也不会重复卖光）；0=完全按轮种表卖（旧逻辑）
    EGG_MILK_BATCH_WAIT_SEC: 40,   // [改] 鸡场/马场流程做完后，鸡蛋/马奶不立刻单独跑仓库：最多等这么多秒，等另一边也做完，合并成一趟一起卖；0=做完立刻单独卖（旧逻辑）
    LOBBY_ENTER_LIST_BTN: [2250, 995], // 进列表的坐标
    LOBBY_ENTER_FARM_BTN: [1535, 290]  // 进农场的坐标
};

// ============================================================
// ============ 轮种表：一圈6轮，跑完自动回到第1轮 ============
// ============================================================
// crop  = 这一轮种什么：wheat小麦 / rice水稻 / soy大豆 / cane甘蔗
// sells = 这一轮"种下去之后"去仓库卖的东西，格式 ['作物', 次数]，卖的是前面收上来的存货；
//         每卖一次约卖掉库存的一半；留空 [] 表示这一轮不去仓库。
//         [改] 开启 SELL_ONLY_AFTER_HARVEST 时，某作物如果还没有"收上来后没卖过"的存货，这一项会被自动跳过；
//         同一趟里实际的卖货顺序由脚本按仓库格子位置从后往前排，与这里写的先后无关。
var SCHEDULE = [
    { crop: 'wheat', sells: [['rice', 1], ['cane', 4]] },        // 1 甘蔗收完后种小麦：先卖水稻1次，再卖甘蔗4次（第一圈开局因为还没收过，会自动跳过）
    { crop: 'wheat', sells: [['wheat', 1]] },                    // 2 小麦收完后再种小麦：卖小麦1次
    { crop: 'rice',  sells: [['wheat', 1]] },                    // 3 小麦收完后种水稻：再卖小麦1次
    { crop: 'soy',   sells: [] },                                // 4 大豆第1轮
    { crop: 'soy',   sells: [['soy', 3]] },                      // 5 大豆收完一轮再种一轮：卖大豆3次
    { crop: 'cane',  sells: [['soy', 3]] }                       // 6 大豆第2轮收完后种甘蔗：再卖大豆3次
];

// 爆仓变卖：先把鸡蛋、马奶各卖1次，再按这张表卖作物（['作物', 次数]），卖完从第1轮重新开始。
// 注意每卖一次约卖掉一半库存，卖2次只剩1/4；如果爆仓后第一次鸡场/马场老是缺料，可以把小麦/水稻/大豆改成1次。
var OVERFLOW_SELLS = [['wheat', 2], ['rice', 2], ['soy', 2], ['cane', 2]];

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
        if (CTRL.paused) {
            throw new PauseSignal();
        }
    }
}
// [改] 被实例锁拦截时给提示（刚停止脚本不足20秒就重新运行也会被拦）；拿到锁之后注册退出事件，退出时自动释放锁
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

// ================= 全局配置 =================
var CONFIG = {
    CENTER_TILE: [1200, 540],
    targetTile: [1200, 540],
    seedIcon: [740, 910],
    riceSeedIcon: [935, 900],
    soySeedIcon: [1111, 900],
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
    bubble_CHOP: [665, 1060],
    build_R1: [80, 1025],  enter_R1: [455, 390],
    build_R2: [1325, 755], enter_R2: [1325, 390],
    build_CHOP: [975, 865], enter_CHOP: [880, 475],
    chopFeedIcon: [1216, 870],
    recenterTileAfterFarm: [1215, 775],
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
    readyBufferMs: 4000,
    holdMs: 400
};
// 甘蔗的种子抓取坐标：和镰刀图标坐标保持一致（改 sickleIcon 时会一起跟着变）
CONFIG.caneSeedIcon = CONFIG.sickleIcon;
var PARAMS = {
    wheat:      { topY: 151, bottomY: 924, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.seedIcon,     loop1Ms: 19, loop2Ms: 17, loop3Ms: 15 },
    rice:       { topY: 153, bottomY: 924, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.riceSeedIcon, loop1Ms: 22, loop2Ms: 21, loop3Ms: 20 },
    soy:        { topY: 153, bottomY: 926, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.soySeedIcon,  loop1Ms: 22, loop2Ms: 21, loop3Ms: 20 },
    cane:       { topY: 153, bottomY: 926, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.caneSeedIcon, loop1Ms: 18, loop2Ms: 18, loop3Ms: 14 },
    sickle:     { topY: 153, bottomY: 926, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.sickleIcon,   loop1Ms: 18, loop2Ms: 18, loop3Ms: 14 },
    riceSickle: { topY: 153, bottomY: 924, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.sickleIcon,   loop1Ms: 22, loop2Ms: 21, loop3Ms: 20 }
};
CONFIG.LOOP_COUNT = 3;

// ================= 作物表 =================
// plantKey/harvestKey 对应 PARAMS 里的转圈配置；cooldownSec 是种下去之后等多少秒再去收；
// potionCutSec 是开加速酒后提前的秒数（大豆/甘蔗按比例估的，可自行调）。
var CROPS = {
    wheat: { label: '小麦', plantKey: 'wheat', harvestKey: 'sickle',     cooldownSec: PANEL.WHEAT_COOLDOWN_SEC, potionCutSec: 3,  slot: CONFIG.wheatSlotInWarehouse, sellBtn: CONFIG.sellBtn },
    rice:  { label: '水稻', plantKey: 'rice',  harvestKey: 'riceSickle', cooldownSec: PANEL.RICE_COOLDOWN_SEC,  potionCutSec: 6,  slot: CONFIG.riceSlotInWarehouse,  sellBtn: CONFIG.riceSellBtn },
    soy:   { label: '大豆', plantKey: 'soy',   harvestKey: 'sickle',     cooldownSec: PANEL.SOY_COOLDOWN_SEC,   potionCutSec: 12, slot: CONFIG.soySlotInWarehouse,   sellBtn: CONFIG.soySellBtn },
    cane:  { label: '甘蔗', plantKey: 'cane',  harvestKey: 'sickle',     cooldownSec: PANEL.CANE_COOLDOWN_SEC,  potionCutSec: 36, slot: CONFIG.caneSlotInWarehouse,  sellBtn: CONFIG.caneSellBtn }
};
var CROP_KEYS = ['wheat', 'rice', 'soy', 'cane'];

// ================= 加速酒 =================
var potionActive = false;
var potionStartTime = 0;
var potionHours = 6;
var POTION_EARLY_EXPIRE_MS = 5 * 60 * 1000;
function computeWaitSeconds(cropKey) {
    var crop = CROPS[cropKey];
    var seconds = crop.cooldownSec;
    if (potionActive) {
        var effectiveExpiryMs = potionHours * 3600000 - POTION_EARLY_EXPIRE_MS;
        var elapsedMs = Date.now() - potionStartTime;
        if (elapsedMs < effectiveExpiryMs) {
            seconds -= crop.potionCutSec;
        } else {
            potionActive = false;
        }
    }
    return seconds;
}

// ================= 状态变量 =================
var lastPlantTime = 0;
var currentCrop = 'wheat';          // 当前这一轮种下去的作物
var roundIdx = 0;                   // 当前处于 SCHEDULE 的第几轮（从0开始）
var sellsDoneThisRound = false;     // 本轮的卖货已经做过（防止暂停后重新种植时重复卖）
var resetAfterHarvest = false;      // 抢收（饲料缺）触发后，等本轮作物收完再回到第1轮
var needSellEggs = false;
var needSellMilk = false;
var consecutiveWarehouseFullRecoveries = 0;
var MAX_CONSECUTIVE_WAREHOUSE_FULL_RECOVERIES = 3;
var chickenPartialSince = 0;        // 鸡场气泡开始"不齐"的时刻，0=当前没有在计时
var ranchPartialSince = 0;          // 马场同理
var bubbleFlowActive = false;       // 鸡场/马场流程进行中：为true时一律不检测气泡
var bubbleDetectSuspended = false;
var stationGoodsPending = false;
// [改] 卖货相关状态
var unsoldStock = { wheat: false, rice: false, soy: false, cane: false }; // 该作物是否"收上来了、且收完后还没卖过"
var plantDone = false;              // 本轮种植的拖拽是否已经完整跑完（挽救流程据此决定回中后该"收"还是"重新种"）
var pendingSellSince = 0;           // 鸡蛋/马奶开始"等着合并卖"的时刻，0=没有待卖
var warehouseTripCount = 0;         // 累计去了几趟仓库（只用于日志核对）
var centerTouched = false;          // [改] 最近一次碰的是不是中心土地，且之后还没点过右下角SAFE_CLOSE（true 时不许再点中心土地）

// ================= 悬浮控制/暂停状态 =================
var CTRL = {
    paused: false,
    settingsOpen: false,
    actionInProgress: true,
    currentPhase: 'harvest'
};
var skipToHarvestOnce = false;
var skipWaitOnce = false;           // 手动暂停后选"收割"：不再等成熟计时，直接进入收割
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
// 动作即将开始：如果设置面板还开着，强制收起并自动暂停（原 waitUntilFree 里的逻辑）
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

// ================= [改] 中心土地防连点 =================
// 规则：中心土地不能连续点两次（不要求时间间隔，但两次之间必须点过右下角 SAFE_CLOSE）。
// 连续点会把中心那一格单独收掉，之后镰刀就收不了其他作物。
// 所以：脚本里所有点右下角都走 clickSafeClose()（会清掉 centerTouched），
//       所有点中心土地都走 clickCenterTile()（点之前如果 centerTouched 还是 true，会先自动点一下右下角）。
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
// 在 (cx,cy) 周围 ±radius 的方形区域内按 step 采样，只要有任意一个像素与
// targetColor 的差值在 tolerance 以内就算命中。用于检测小图标/小色块（驿站
// 出货绿点、驿站画面左上角水色等），比整体求均值更适合"小范围特征色"场景。
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
    centerTouched = true; // [改] 拖拽的终点落在中心土地上，下一次点中心土地之前必须先点右下角
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
// 返回值：'none'=本次没有动作；'full'=四个气泡齐了，正常处理；
//         'grab'=气泡只出现一部分，等满宽限时间还不齐，抢收（说明饲料缺了）
function checkAndRunFarmTasks() {
    if (!PANEL.CHICKEN_ENABLED) return 'none';
    if (bubbleFlowActive) return 'none';
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
            log("鸡场气泡不齐，开始计时，最多等" + PANEL.PARTIAL_GRACE_SEC + "秒");
        } else if (Date.now() - chickenPartialSince >= PANEL.PARTIAL_GRACE_SEC * 1000) {
            mode = 'grab';
            chickenPartialSince = 0;
            toastLog("鸡场气泡等了" + PANEL.PARTIAL_GRACE_SEC + "秒仍不齐，抢收");
        }
    } else {
        chickenPartialSince = 0;
    }
    if (mode === 'none') return 'none';

    // ---- 从这里开始进入鸡场流程：流程进行期间禁用气泡检测 ----
    beginAction();
    bubbleFlowActive = true;
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
    clickSafeClose(); pausableSleep(1000);
    click(CONFIG.build_FT[0], CONFIG.build_FT[1]); pausableSleep(1000);
    click(CONFIG.enter_FT[0], CONFIG.enter_FT[1]); pausableSleep(1500);
    for (var i2 = 0; i2 < PANEL.FACTORY_FEED_PULLS; i2++) {
        pullFeedSafe(factX, factY);
    }
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
    centerTouched = true; // [改] 这一下可能选中了中心土地
    pausableSleep(1000);
    needSellEggs = true;
    bubbleFlowActive = false;
    return mode;
}

// ================= 马场 =================
// 返回值同 checkAndRunFarmTasks
function checkAndRunRanchTasks() {
    if (!PANEL.RANCH_ENABLED) return 'none';
    if (bubbleFlowActive) return 'none';
    var img = safeCaptureScreen();
    if (!img) return 'none';
    var has_R1 = isBubblePresent(img, CONFIG.bubble_R1[0], CONFIG.bubble_R1[1]);
    var has_R2 = isBubblePresent(img, CONFIG.bubble_R2[0], CONFIG.bubble_R2[1]);
    var has_CHOP = isBubblePresent(img, CONFIG.bubble_CHOP[0], CONFIG.bubble_CHOP[1]); // ✅ 新增防误点判定
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
            log("马场气泡不齐，开始计时，最多等" + PANEL.PARTIAL_GRACE_SEC + "秒");
        } else if (Date.now() - ranchPartialSince >= PANEL.PARTIAL_GRACE_SEC * 1000) {
            mode = 'grab';
            ranchPartialSince = 0;
            toastLog("马场气泡等了" + PANEL.PARTIAL_GRACE_SEC + "秒仍不齐，抢收");
        }
    } else {
        ranchPartialSince = 0;
    }
    if (mode === 'none') return 'none';

    // ---- 从这里开始进入马场流程：流程进行期间禁用气泡检测 ----
    beginAction();
    bubbleFlowActive = true;
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
    clickSafeClose(); pausableSleep(1000);
    click(CONFIG.build_R2[0], CONFIG.build_R2[1]); pausableSleep(1000);
    click(CONFIG.enter_R2[0], CONFIG.enter_R2[1]); pausableSleep(1500);
    gesture(1500, CONFIG.coopFeedIcon, CONFIG.coopChicken1, CONFIG.coopChicken6);
    pausableSleep(200);
    click(CONFIG.coopPopupSafeClick[0], CONFIG.coopPopupSafeClick[1]);
    pausableSleep(400);
    clickSafeClose(); pausableSleep(1000);
    pausableSleep(1000);
    click(CONFIG.build_CHOP[0], CONFIG.build_CHOP[1]); pausableSleep(1000);
    click(CONFIG.enter_CHOP[0], CONFIG.enter_CHOP[1]); pausableSleep(1500);
    for (var i = 0; i < PANEL.CHOP_FEED_PULLS; i++) {
        pullFeedSafe(CONFIG.chopFeedIcon[0], CONFIG.chopFeedIcon[1]);
    }
    clickSafeClose(); pausableSleep(1000);

    // ================= 马场两步回中 =================
    click(971, 366);
    pausableSleep(3000);
    click(1742, 157);
    pausableSleep(1000);
    // ===============================================

    needSellMilk = true;
    bubbleFlowActive = false;
    return mode;
}

// ============================================================
// ============ 驿站：出货检测 + 自动收货 + 落地驿站画面兜底 ============
// ============================================================
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
        log('[驿站] 已点击装载（PANEL.STATION_LOAD_ENABLED=1）');
    } else {
        log('[驿站] 跳过装载（PANEL.STATION_LOAD_ENABLED=0）');
    }    
    clickSafeClose();
    sleepWithHeartbeat(500);
    log('[驿站] 收货流程完成');
    stationGoodsPending = false;
}

function handleStationScreenIfPresent() {
    while (true) {
        var img = safeCaptureScreen();
        if (!img) return;
        var onStation = isOnStationScreen(img);
        img.recycle();
        if (!onStation) return;

        log('[驿站] 检测到重连后落在了驿站画面（布告栏点不到），先走一遍驿站收货流程');
        collectStationGoods();

        log('[驿站] 收货完毕，点右上角退出，确认回到大厅后重新进入农场');
        exitToLobbyForDrift();
        reenterFarmFromLobby();
    }
}

// ============================================================
// ============ 服务器卡死/画面偏移 自动重连恢复 (FreezeRecovery) ============
// ============================================================

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
// 加入色相/RGB约束，防止误认白云或亮色活动弹窗
CONFIG.disconnectDialogColorRef = [251, 244, 216]; // 色相参考值
CONFIG.disconnectDialogColorTolerance = 30; // RGB色差容差
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
    } catch (e) {
        log('保存卡死调试截图失败: ' + e);
    }
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
        if (points && points.length >= config.minPixels) {
            matchCount++;
        }
    }
    return matchCount === 3;
}

function isDisconnectDialogShowing(img) {
    // 检查纯度
    if (!isRegionUniform(img, CONFIG.disconnectDialogCheckRegion, CONFIG.disconnectDialogUniformTolerance)) return false;
    
    // 检查亮度
    var avgC = regionAvgColor(img, CONFIG.disconnectDialogCheckRegion);
    var brightness = (avgC[0] + avgC[1] + avgC[2]) / 3;
    if (brightness < CONFIG.disconnectDialogMinBrightness) return false;
    
    // 检查RGB是否匹配米黄色约束
    var diffR = Math.abs(avgC[0] - CONFIG.disconnectDialogColorRef[0]);
    var diffG = Math.abs(avgC[1] - CONFIG.disconnectDialogColorRef[1]);
    var diffB = Math.abs(avgC[2] - CONFIG.disconnectDialogColorRef[2]);
    if (Math.max(diffR, diffG, diffB) > CONFIG.disconnectDialogColorTolerance) {
        log('[FreezeRecovery] 拦截到伪装弹窗，RGB不符: ' + Math.round(avgC[0]) + ',' + Math.round(avgC[1]) + ',' + Math.round(avgC[2]));
        return false;
    }
    return true;
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
    log('[FreezeRecovery] (偏移) 开始点退出键，上限5次...');
    var round = 0;
    while (round < 5) { // 限制上限5次
        round++;
        renewLock();
        click(CONFIG.exitGameBtn[0], CONFIG.exitGameBtn[1]);
        sleepWithHeartbeat(10000);

        var img = safeCaptureScreen();
        if (img) {
            if (checkIsHomeSingleFrame(img)) {
                log('[FreezeRecovery] (偏移) 第' + round + '次点退出后初测疑似大厅，拖屏防误报确认...');
                randomDragScreen(300);
                sleepWithHeartbeat(1000);
                var imgConfirm = safeCaptureScreen();
                var confirmed = imgConfirm ? checkIsHomeSingleFrame(imgConfirm) : false;
                if (imgConfirm) imgConfirm.recycle();

                if (confirmed) {
                    log('[FreezeRecovery] (偏移) 拖屏复测成功，已确认回到大厅');
                    img.recycle();
                    return true;
                } else {
                    log('[FreezeRecovery] (偏移) 拖屏复测失败，判定为农场场景误判');
                }
            }
            img.recycle();
        }
        log('[FreezeRecovery] (偏移) 第' + round + '次点退出未生效（可能点到了建筑上，退出键没弹出），重试');
        if (round % 5 === 0) toastLog('偏移恢复已尝试' + round + '次退出仍未成功，继续重试中…');
    }
    log('[FreezeRecovery] (偏移) 连续5次退出失败，放弃主动尝试，转入被动等待');
    return false;
}

function reenterFarmFromLobby() {
    log('[FreezeRecovery] 从大厅重新进入农场');
    var attempt = 0;
    while (true) {
        attempt++;
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
        if (!stillHome) {
            if (attempt > 1) {
                log('[FreezeRecovery] 从大厅进入农场第' + attempt + '次尝试后主页特征已消失，判定进入成功');
            }
            return;
        }
        log('[FreezeRecovery] 从大厅进入农场第' + attempt + '次尝试后仍检测到主页特征（点击可能被吞/没生效），重试');
        if (attempt % 3 === 0) {
            toastLog('从大厅进入农场已重试' + attempt + '次仍未成功，继续重试中…');
        }
    }
}

function clickReconnectAndConfirm() {
    var round = 0;
    while (true) {
        round++;
        click(CONFIG.disconnectDialogReconnectBtn[0], CONFIG.disconnectDialogReconnectBtn[1]);
        sleepWithHeartbeat(10000);
        renewLock();

        var img = safeCaptureScreen();
        if (!img) continue;

        if (isDisconnectDialogShowing(img)) {
            img.recycle();
            log('[FreezeRecovery] 重连后第' + round + '次，断线弹窗仍在，继续点重连');
            if (round % 5 === 0) toastLog('重连按钮已点' + round + '次，弹窗仍未消失，继续重试中…');
            continue;
        }

        var atLobby = false;
        if (checkIsHomeSingleFrame(img)) {
            log('[FreezeRecovery] 重连弹窗消失，初测疑似大厅，拖屏确认...');
            randomDragScreen(300);
            sleepWithHeartbeat(1000);
            var imgConfirm = safeCaptureScreen();
            atLobby = imgConfirm ? checkIsHomeSingleFrame(imgConfirm) : false;
            if (imgConfirm) imgConfirm.recycle();
        }
        img.recycle();

        if (atLobby) {
            log('[FreezeRecovery] 重连后拖屏复测确认回到大厅，切换到"从大厅重新进入农场"流程');
            reenterFarmFromLobby();
        } else {
            log('[FreezeRecovery] 重连后确认不在大厅，判定已直接回到游戏内部');
        }
        return;
    }
}

function recenterAndDetectState() {
    handleStationScreenIfPresent();

    log('[FreezeRecovery] 点击布告栏回中按钮');
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
        clickSafeClose();
        sleepWithHeartbeat(500);
        // [改] 原来这里无条件 refreshDriftReference()，等于把"可能还没回正的画面"直接当成新参考图（认贼作父）。
        // 现在只有当前画面确实能和旧参考图对上才刷新；对不上就保留旧参考图，让后面的偏移校验继续起作用。
        var imgChk = safeCaptureScreen();
        if (imgChk) {
            if (DriftGuard.matchReference(imgChk)) {
                DriftGuard.refreshReference(imgChk);
            } else {
                log('[FreezeRecovery] 点空后画面与旧参考图对不上，保留旧参考图，不刷新');
            }
            imgChk.recycle();
        }
        DriftGuard.reset();
        if (patchA) patchA.recycle(); // [改] 原来这条路径漏了回收
        return { mode: 'harvest', menuAlreadyOpen: false };
    }

    sleep(350); 
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
        
        // 修复“认贼作父”的严重逻辑漏洞：只有真正回中成功时，才刷新参考图
        if (recentered) {
            DriftGuard.refreshReference(imgB);
        } else {
            log('[FreezeRecovery] 回中确认失败，拒绝污染参考图！');
        }
        
        try {
            var ts = new java.text.SimpleDateFormat('yyyyMMdd_HHmmss_SSS').format(new Date());
            images.save(imgB, DEBUG_DIR + ts + '_freeze_recenter_state_' + (sickleReady ? 'sickle' : 'notsickle') + '.png');
        } catch (e) { log('[FreezeRecovery] 保存回中调试截图失败: ' + e); }
        imgB.recycle();
    }
    if (patchA) patchA.recycle();

    log(recentered
        ? '[FreezeRecovery] 回中确认成功（回中前后两次截图的参考区域一致）'
        : '[FreezeRecovery] 回中比对未能确认一致，继续后续流程');
    log('[FreezeRecovery] 回中完成，菜单已打开，统一接收割流程');
    return { mode: 'harvest', menuAlreadyOpen: true };
}

function handleFreezeRecovery(skipPhase1) {
    if (!skipPhase1) {
        log('[FreezeRecovery] (卡死) Phase1开始...');
        for (var i = 1; i <= 3; i++) {
            randomDragScreen(300);
            sleepWithHeartbeat(1000);
            click(CONFIG.exitGameBtn[0], CONFIG.exitGameBtn[1]);
            sleepWithHeartbeat(10000);

            var img = safeCaptureScreen();
            if (!img) continue;

            if (checkIsHomeSingleFrame(img)) {
                log('[FreezeRecovery] (卡死) Phase1第' + i + '轮：初测疑似回到大厅，拖屏复测...');
                randomDragScreen(300);
                sleepWithHeartbeat(1000);
                var imgConfirm = safeCaptureScreen();
                var confirmed = imgConfirm ? checkIsHomeSingleFrame(imgConfirm) : false;
                if (imgConfirm) imgConfirm.recycle();
                
                if (confirmed) {
                    img.recycle();
                    log('[FreezeRecovery] (卡死) Phase1第' + i + '轮：拖屏复测成功，✅ 确认回到大厅');
                    reenterFarmFromLobby();
                    return recenterAndDetectState();
                } else {
                    log('[FreezeRecovery] (卡死) Phase1第' + i + '轮：拖屏复测失败，❌ 判定为农场误报');
                }
            }

            if (isDisconnectDialogShowing(img)) {
                img.recycle();
                log('[FreezeRecovery] (卡死) Phase1第' + i + '轮：检测到断线弹窗！');
                clickReconnectAndConfirm();
                return recenterAndDetectState();
            }

            var stillMatchesRef = DriftGuard.matchReference(img);
            img.recycle();
            if (!stillMatchesRef) {
                log('[FreezeRecovery] (卡死) Phase1第' + i + '轮：画面已偏移，转入偏移恢复流程');
                saveFreezeDebugImg('phase1_drift_round' + i);
                var exitOk = exitToLobbyForDrift();
                if (exitOk) {
                    reenterFarmFromLobby();
                    return recenterAndDetectState();
                } else {
                    log('[FreezeRecovery] (卡死) 偏移退出尝试失败，直接转入Phase 2');
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
            log('[FreezeRecovery] (卡死) Phase2第' + waitRound + '轮：检测到断线弹窗！');
            clickReconnectAndConfirm();
            return recenterAndDetectState();
        }

        if (checkIsHomeSingleFrame(img2)) {
            log('[FreezeRecovery] (卡死) Phase2第' + waitRound + '轮：初测疑似大厅，拖屏复测...');
            randomDragScreen(300);
            sleepWithHeartbeat(1000);
            var imgConfirm2 = safeCaptureScreen();
            var confirmed2 = imgConfirm2 ? checkIsHomeSingleFrame(imgConfirm2) : false;
            if (imgConfirm2) imgConfirm2.recycle();
            
            if (confirmed2) {
                img2.recycle();
                log('[FreezeRecovery] (卡死) Phase2第' + waitRound + '轮：✅ 确认自动弹回大厅');
                reenterFarmFromLobby();
                return recenterAndDetectState();
            }
        }
        img2.recycle();
        
        // 关键防死锁逻辑：不认识的界面不干等，盲点一次右上角破局
        log('[FreezeRecovery] (卡死) Phase2第' + waitRound + '轮：未检测到断线或大厅，盲点一次右上角...');
        click(CONFIG.exitGameBtn[0], CONFIG.exitGameBtn[1]);
    }
}

function recoverFromFreeze(reasonLabel, kind) {
    toastLog('触发自动重连恢复（' + reasonLabel + '），请勿操作手机');
    log('[FreezeRecovery] ===== 开始恢复流程，原因: ' + reasonLabel + '（类型: ' + kind + '）=====');
    saveFreezeDebugImg(kind + '_start');

    var detectionResult;
    if (kind === 'drift') {
        var exitOk = exitToLobbyForDrift();
        if (exitOk) {
            reenterFarmFromLobby();
            detectionResult = recenterAndDetectState();
        } else {
            // 如果连续5次都没退出来，强制转入带盲点的 Phase 2 死等流程
            detectionResult = handleFreezeRecovery(true); 
        }
    } else {
        detectionResult = handleFreezeRecovery(false);
    }

    // [改] 回中后一律先当作"待收割"。但如果卡死发生在本轮种下去之前（比如种植时点中心土地菜单连续没弹出），
    // 田里是空的，接着去"等成熟→收割"会在空地上把甘蔗种下去（甘蔗种子坐标和镰刀坐标是同一个）。
    // 所以只有本轮已经种完（plantDone）才续接收割，否则重新种这一轮。
    var effMode = (detectionResult.mode === 'harvest' && plantDone) ? 'harvest' : 'plant';
    var menuOpen = detectionResult.menuAlreadyOpen;
    if (effMode === 'harvest') {
        // 回中成功、接着读秒：最后一个动作固定是点一下右下角（"点空"分支里已经点过；菜单还开着就在这里点）
        if (menuOpen) {
            clickSafeClose();
            sleepWithHeartbeat(500);
        }
        menuOpen = false;
    }
    detectionResult = { mode: effMode, menuAlreadyOpen: menuOpen };
    log('[FreezeRecovery] ===== 恢复流程完成，续接: ' + effMode +
        (effMode === 'harvest' ? '（已点右下角，沿用种植时记下的时间继续读秒，成熟后再点中心土地收割）' : '（本轮还没种下去，重新种植）') + ' =====');
    toastLog('已重连并回正，继续' + (effMode === 'harvest' ? '等待成熟并收割' : '重新种植'));
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

var CENTER_CLICK_RETRY_COUNT = 5;

function clickAndAwaitMenu(clickX, clickY, stepLabel) {
    for (var attempt = 1; attempt <= CENTER_CLICK_RETRY_COUNT; attempt++) {
        // [改] 中心土地绝不连点两次：上一次碰过中心土地（上一次尝试、拖拽收尾、鸡场收尾等）就先点右下角，
        // 第1次尝试也一样。先清干净再截"菜单弹出前"的基准图，这样菜单弹出的判定也更准。
        ensureCenterClean();
        var imgRef = safeCaptureScreen();
        if (imgRef) {
            menuRefColors = getRegionColorFingerprint(imgRef);
            imgRef.recycle();
        }
        clickCenterTile(clickX, clickY);
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

// ============================================================
// ============ 连续"仓库已满"误判兜底：统一计数 + 满3次整体重置 ============
// ============================================================
// atHarvest=true：爆仓发生在收割途中，变卖完直接从第1轮（小麦）重新开始；
// atHarvest=false：爆仓发生在种植后，变卖完让本轮作物正常收完，再回到第1轮。
function handleWarehouseFullOrFallback(reasonLabel, atHarvest) {
    consecutiveWarehouseFullRecoveries++;
    if (consecutiveWarehouseFullRecoveries >= MAX_CONSECUTIVE_WAREHOUSE_FULL_RECOVERIES) {
        toastLog('仓库已满挽救连续触发' + consecutiveWarehouseFullRecoveries + '次（' + reasonLabel + '），怀疑是误触了远处建筑弹窗，改为整体重置：退出游戏重进');
        log('[WarehouseFullFallback] 连续' + consecutiveWarehouseFullRecoveries + '次疑似爆仓（触发环节: ' + reasonLabel + '），触发兜底：清场退出重进，不再继续按仓库已满的固定坐标点');
        consecutiveWarehouseFullRecoveries = 0;
        clickSafeClose();
        sleepWithHeartbeat(500);
        var result = recoverFromFreeze('连续' + MAX_CONSECUTIVE_WAREHOUSE_FULL_RECOVERIES + '次疑似爆仓误判(' + reasonLabel + ')', 'drift');
        throw new RecoveredCycleSignal(result.mode, result.menuAlreadyOpen);
    }
    toastLog('仓库已满弹窗，自动挽救 (第' + consecutiveWarehouseFullRecoveries + '次，' + reasonLabel + ')');
    handleWarehouseFullDuringHarvest();
    if (atHarvest) {
        bubbleDetectSuspended = true;
        log('[爆仓] 变卖完成，暂停气泡检测直到下次收割干净，并从第1轮（小麦）重新开始');
        throw new RestartCycleSignal();
    }
    resetAfterHarvest = true;
    // [改] 爆仓变卖已经把各作物都卖过了，这一轮就不用再按轮种表额外跑一趟仓库（原来会紧接着再多跑一趟）
    sellsDoneThisRound = true;
    log('[爆仓] 种植阶段触发的变卖已完成，本轮不再重复卖货，等本轮作物收割后回到第1轮（小麦）');
}

// ================= 仓库操作 =================
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
    // [改] 回到农场后固定补一下右下角。不管是哪条路径去的仓库（种植后卖货/鸡蛋马奶/爆仓变卖），
    // 回来时中心土地都可能处于"选中"状态；不清掉的话，之后点中心土地就等于连点两次。
    clickSafeClose();
    pausableSleep(500);
}

// ---- [改] 卖货队列 ----
// 每一项：{ label:显示名, slot:[x,y]格子, btn:[x,y]出售键, times:次数, cropKey:作物名或null, tag:'egg'/'milk'/null }
// 仓库里某个格子被卖空后，排在它后面的格子会整体往前挪一位。所以同一趟里一律"从后往前"卖
// （按格子坐标：下面的行先卖，同一行右边先卖），这样就算某个格子被卖空，也只会挪动已经卖完的格子，还没卖的格子位置不变。
function slotOrderCompare(a, b) {
    var dy = a.slot[1] - b.slot[1];
    if (Math.abs(dy) > 100) return dy > 0 ? -1 : 1; // 行不同：靠下的行先卖
    return b.slot[0] - a.slot[0];                   // 同一行：靠右的先卖
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
function describeSellItems(items) {
    var parts = [];
    for (var i = 0; i < items.length; i++) {
        parts.push(items[i].label + '×' + items[i].times);
    }
    return parts.join(' → ');
}
// 按轮种表的卖货清单生成队列；开启 SELL_ONLY_AFTER_HARVEST 时，没有"收上来后没卖过"的存货的作物直接跳过
function buildCropSellItems(sellList) {
    var items = [];
    if (!sellList) return items;
    for (var i = 0; i < sellList.length; i++) {
        var key = sellList[i][0];
        var times = sellList[i][1];
        if (PANEL.SELL_ONLY_AFTER_HARVEST && !unsoldStock[key]) {
            log('[卖货] 跳过' + CROPS[key].label + '：还没有"收上来后没卖过"的新存货（开局或重置回第1轮时不去卖）');
            continue;
        }
        items.push(cropSellItem(key, times));
    }
    return items;
}
// 执行队列（调用前已经排好序）。每一项卖完就立刻清对应的标记：中途被暂停再恢复时，已经卖完的不会重复卖
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
// sellList: [['wheat', 1], ['rice', 2]]；withEggsMilk=true 时，有待卖的鸡蛋/马奶顺带卖掉；reason 只用于日志
function runWarehouseSells(sellList, withEggsMilk, reason) {
    var items = buildCropSellItems(sellList);
    if (withEggsMilk && needSellEggs && CONFIG.eggSlotInWarehouse && CONFIG.eggSellBtn) items.push(eggSellItem());
    if (withEggsMilk && needSellMilk && CONFIG.milkSlotInWarehouse && CONFIG.milkSellBtn) items.push(milkSellItem());
    if (items.length === 0) return;
    items.sort(slotOrderCompare);
    warehouseTripCount++;
    log('[仓库] 第' + warehouseTripCount + '趟（' + (reason || '未标注') + '）：' + describeSellItems(items));
    openWarehouse();
    runSellQueue(items);
    closeWarehouseToField();
    if (!needSellEggs && !needSellMilk) pendingSellSince = 0;
}
// 鸡场/马场流程结束后单独去卖一次鸡蛋/马奶
function sellEggsMilkTrip() {
    runWarehouseSells([], true, '卖鸡蛋/马奶');
}

// 爆仓变卖：先卖鸡蛋、马奶各1次，再按 OVERFLOW_SELLS 表卖作物（默认四种各2次）；同样按格子从后往前卖
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
    // 爆仓变卖已经把各作物都卖过了，之前"待卖"的标记作废，避免紧接着又按轮种表重复卖
    for (var ck in unsoldStock) unsoldStock[ck] = false;
    pendingSellSince = 0;
    log('仓库已满挽救流程完成：鸡蛋/马奶各卖1次，作物按 OVERFLOW_SELLS 表变卖');
}

// ================= 四个主阶段 =================
function plantAll(cropKey, menuAlreadyOpen) {
    CTRL.currentPhase = 'plant';
    currentCrop = cropKey;
    lastPlantTime = Date.now();
    plantDone = false; // [改]

    if (!menuAlreadyOpen) {
        clickAndAwaitMenu(CONFIG.targetTile[0], CONFIG.targetTile[1], 'plant');
    } else {
        log('[plantAll] 菜单已由挽救流程回中时打开，直接复用，不再重复点击中心地');
    }

    toastLog("== 播种" + CROPS[cropKey].label + " ==");
    dragFarmLoop(CROPS[cropKey].plantKey);
    plantDone = true; // [改] 种植拖拽已完整跑完；此后再发生卡死/偏移，回中后应该接着等收割，而不是重新种
    pausableSleep(500);
    var driftResult = DriftGuard.softCheck('plant');
    if (driftResult === 'warehouseFull') {
        log('种植阶段检测到仓库已满弹窗，进入挽救流程');
        handleWarehouseFullOrFallback('plant-softCheck', false);
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
            handleWarehouseFullOrFallback('plant-immediate', false);
        } else {
            log('[plantAll] 三图校验未确认偏移（误报），继续正常流程');
        }
    }
}

// ================= 等待期间的气泡巡检 =================
// [改] 鸡蛋/马奶合并成一趟卖：
// 鸡场/马场流程做完后只记下"有货待卖"，等两边都做完（或等满 EGG_MILK_BATCH_WAIT_SEC 秒）再一起去仓库。
// EGG_MILK_BATCH_WAIT_SEC=0 时等于旧逻辑：每个流程做完立刻单独卖。
// 等待期结束时还没卖出去的，会在下一轮"种植后"的那趟仓库里顺带卖掉。
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

// 每次巡检：先查鸡场，鸡场没动作再查马场。任何一个流程跑完之后，本次巡检就到此为止
// （流程期间禁用气泡检测，镜头可能还在漂，不紧接着检测下一个），等下一次巡检再说。
function bubbleTick() {
    if (bubbleDetectSuspended || bubbleFlowActive || CTRL.settingsOpen) return;
    var r1 = checkAndRunFarmTasks();
    var r2 = 'none';
    if (r1 === 'none') {
        r2 = checkAndRunRanchTasks();
    } else {
        log('[气泡] 鸡场流程刚结束，本次巡检不再紧接着检测马场，等下一次巡检');
    }
    var ran = (r1 !== 'none' || r2 !== 'none');

    if (ran) {
        // [改] 鸡场/马场流程做完（常规回中完成）后，第一件事先点右下角，再去做别的（包括去仓库）
        clickSafeClose();
        pausableSleep(500);
        if (r1 === 'grab' || r2 === 'grab') {
            resetAfterHarvest = true;
            toastLog('触发了抢收，判定饲料缺了，本轮作物收完后回到第1轮（小麦）重新走');
            log('[轮种] 抢收触发，resetAfterHarvest=true');
        }
    }

    // 该去卖的时候（两边都做完/等满时间）去一趟仓库；每次巡检都会判断一次，所以超时的也能及时卖掉
    flushEggMilkIfDue();
}

// 镰刀菜单检测：沿用 recenterAndDetectState 里已有的 sickleStateRegion 纯色判定
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
// 点中心地打开菜单，并确认弹出的是镰刀菜单；没熟就稍后重试
function openMenuForHarvest(readyAt) {
    if (!PANEL.SICKLE_CHECK_ENABLED) {
        clickAndAwaitMenu(CONFIG.targetTile[0], CONFIG.targetTile[1], 'harvest');
        return;
    }
    var fallbackAt = Math.max(readyAt, Date.now()) + PANEL.SICKLE_POLL_MAX_SEC * 1000;
    var attempt = 0;
    while (true) {
        attempt++;
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
            if (sickle) {
                if (attempt > 1) {
                    log('[收割] 第' + attempt + '次点击后检测到镰刀菜单，开始收割');
                }
                return;
            }
            log('[收割] 第' + attempt + '次：菜单弹出了但没检测到镰刀（作物可能还没熟），3秒后重试');
        } else {
            log('[收割] 第' + attempt + '次：点中心地后3秒内菜单没弹出，3秒后重试');
        }
        if (Date.now() >= fallbackAt) {
            log('[收割] 到点后超过' + PANEL.SICKLE_POLL_MAX_SEC + '秒仍没检测到镰刀，放弃镰刀检测，走原来的点中心地流程');
            saveMenuMissDebugImg('sickle_timeout');
            clickAndAwaitMenu(CONFIG.targetTile[0], CONFIG.targetTile[1], 'harvest');
            return;
        }
        pausableSleep(3000);
    }
}

// 等待作物成熟（期间巡检气泡）-> 到点 -> 点中心地确认镰刀 -> 收割。
// forceNow=true：手动暂停后选了"收割"，不等计时，直接进入收割。
function waitReadyAndHarvest(forceNow) {
    CTRL.currentPhase = 'wait';
    bubbleFlowActive = false;
    chickenPartialSince = 0;
    ranchPartialSince = 0;
    var crop = CROPS[currentCrop];
    var readyAt = forceNow
        ? Date.now()
        : (lastPlantTime + computeWaitSeconds(currentCrop) * 1000 + CONFIG.readyBufferMs);

    // 回中之后先点一下右下角，把种植/收割菜单收掉，免得挡住气泡
    clickSafeClose();
    pausableSleep(500);
    log('[等待] ' + crop.label + ' 还需约 ' + Math.max(0, Math.round((readyAt - Date.now()) / 1000)) + ' 秒到点');

    var pollMs = Math.max(1, PANEL.BUBBLE_POLL_SEC) * 1000;
    var stopMs = Math.max(0, PANEL.BUBBLE_STOP_BEFORE_READY_SEC) * 1000;
    while (Date.now() < readyAt) {
        setActionInProgress(false);
        var remain = readyAt - Date.now();
        if (remain <= stopMs) {
            // 到点前最后几秒：不再检测气泡，直接睡到到点
            pausableSleep(remain);
            break;
        }
        pausableSleep(Math.min(pollMs, remain - stopMs));
        if (readyAt - Date.now() <= stopMs) continue;
        bubbleTick();
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
    } else {
        log('[harvestAll] 菜单已经打开（镰刀已确认/挽救流程已回中），直接收割，不再重复点击中心地');
    }

    dragFarmLoop(CROPS[currentCrop].harvestKey);
    unsoldStock[currentCrop] = true; // [改] 收割拖拽跑完：这种作物有了"收上来、还没卖"的存货，后面轮种表里轮到它时才会去卖
    pausableSleep(500);
    var result = DriftGuard.finalCheck('harvest');
    if (result === 'ok') {
        consecutiveWarehouseFullRecoveries = 0;
        if (bubbleDetectSuspended) {
            bubbleDetectSuspended = false;
            log('本轮收割完整完成，未再次爆仓，恢复鸡场/马场气泡检测');
        }
        var imgStation = safeCaptureScreen();
        if (imgStation) {
            if (checkStationHasGoods(imgStation)) {
                stationGoodsPending = true;
                log('[驿站] 收割完毕检测到驿站出货绿点，先记下来，等下一轮种植/卖货都走完后再去处理');
            }
            imgStation.recycle();
        }
        return;
    }
    if (result === 'warehouseFull') {
        handleWarehouseFullOrFallback('harvest', true);
        return;
    }
    toastLog('三图校验+交叉比对确认画面偏移，自动重连恢复中（不再停止脚本）…');
    log('[harvestAll] 确认画面偏移，触发挽救流程');
    var result2 = recoverFromFreeze('harvest收割后三图校验确认偏移', 'drift');
    throw new RecoveredCycleSignal(result2.mode, result2.menuAlreadyOpen);
}

// 本轮结束，推进到下一轮；如果之前触发过抢收，则回到第1轮
function advanceRound() {
    sellsDoneThisRound = false;
    if (resetAfterHarvest) {
        resetAfterHarvest = false;
        roundIdx = 0;
        log('[轮种] 本轮收割完毕，回到第1轮（小麦）重新走一遍');
    } else {
        roundIdx = (roundIdx + 1) % SCHEDULE.length;
    }
}

// ================= 暂停恢复处理 =================
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
            skipWaitOnce = true;
            skipToHarvestOnce = true;
        } else {
            toastLog('10秒后开始种植，请确保已回到中心基准地');
            log('[恢复] 用户选择"种植"，等待10秒后从基准地开始完整流程');
            pausableSleep(10000);
            clickSafeClose(); // [改] 暂停期间用户可能碰过中心土地，先点一下右下角清掉选中状态
            pausableSleep(500);
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
    if (PANEL.STATION_LOAD_ENABLED) {
        setToggleOn(ctrlWin.stationLoadTgl);
    } else {
        setToggleOff(ctrlWin.stationLoadTgl);
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
    ctrlWin.stationLoadTgl.click(function () {
        if (PANEL.STATION_LOAD_ENABLED) {
            PANEL.STATION_LOAD_ENABLED = 0;
            setToggleOff(ctrlWin.stationLoadTgl);
            log("驿站装载已关闭");
        } else {
            PANEL.STATION_LOAD_ENABLED = 1;
            setToggleOn(ctrlWin.stationLoadTgl);
            log("驿站装载已开启");
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

// 检查是否开启了启动时的加速酒提示
if (PANEL.POTION_STARTUP_PROMPT) {
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
} else {
    log("跳过加速酒初始弹窗，如果需要请在左侧悬浮齿轮设置中开启。");
}

// 轮种表自检：作物名写错的话直接提示并退出，免得跑到一半才报错
(function validateSchedule() {
    for (var i = 0; i < SCHEDULE.length; i++) {
        var r = SCHEDULE[i];
        var bad = null;
        if (!CROPS[r.crop]) bad = r.crop;
        for (var j = 0; !bad && r.sells && j < r.sells.length; j++) {
            if (!CROPS[r.sells[j][0]]) bad = r.sells[j][0];
        }
        if (bad) {
            toastLog("轮种表第" + (i + 1) + "轮里的作物名写错了：" + bad + "（只能是 wheat/rice/soy/cane）");
            releaseLock();
            exit();
        }
    }
    for (var k = 0; k < OVERFLOW_SELLS.length; k++) {
        if (!CROPS[OVERFLOW_SELLS[k][0]]) {
            toastLog("OVERFLOW_SELLS 里的作物名写错了：" + OVERFLOW_SELLS[k][0] + "（只能是 wheat/rice/soy/cane）");
            releaseLock();
            exit();
        }
    }
})();

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

// ================= 主循环：每次循环 = 轮种表里的一轮 =================
while (true) {
    try {
        renewLock();
        setActionInProgress(true);
        var round = SCHEDULE[roundIdx];
        if (skipToHarvestOnce) {
            skipToHarvestOnce = false;
            pendingMenuAlreadyOpen = false;
            var forceNow = skipWaitOnce;
            skipWaitOnce = false;
            log('===== 跳过种植与卖货，直接进入收割：第' + (roundIdx + 1) + '/' + SCHEDULE.length + '轮 ' + CROPS[currentCrop].label + (forceNow ? '（立即收割）' : '（等成熟计时到点）') + ' =====');
            waitReadyAndHarvest(forceNow);
        } else {
            DriftGuard.reset();
            log('===== 第' + (roundIdx + 1) + '/' + SCHEDULE.length + '轮 种' + CROPS[round.crop].label + ' ' + new Date().toLocaleTimeString() + ' =====');
            var menuAlreadyOpenP = pendingMenuAlreadyOpen;
            pendingMenuAlreadyOpen = false;
            plantAll(round.crop, menuAlreadyOpenP);
            if (!sellsDoneThisRound) {
                runWarehouseSells(round.sells, true, '第' + (roundIdx + 1) + '轮种完后卖货');
                sellsDoneThisRound = true;
            }
            clickSafeClose();
            pausableSleep(500);
            // 如果上一轮收割后记下了驿站出货，统一在这里去处理，不打断前面的正常流程。
            if (stationGoodsPending) {
                collectStationGoods();
            }
            var midResult = DriftGuard.midFlowRecheck();
            if (midResult === 'drift') {
                toastLog('中间补测确认画面偏移，自动重连恢复中…');
                log('[主循环] midFlowRecheck 升级三图校验确认偏移，触发挽救流程');
                var midDetection = recoverFromFreeze('midflow中间补测确认偏移', 'drift');
                throw new RecoveredCycleSignal(midDetection.mode, midDetection.menuAlreadyOpen);
            } else if (midResult === 'warehouseFull') {
                handleWarehouseFullOrFallback('midflow', false);
            }
            waitReadyAndHarvest(false);
        }
        log('===== 第' + (roundIdx + 1) + '轮完成 | 截屏: ' + captureStats.total + '次, 失败: ' + captureStats.failed + '次 | 仓库累计: ' + warehouseTripCount + '趟 =====');
        advanceRound();
    } catch (e) {
        bubbleFlowActive = false;
        if (e instanceof PauseSignal) {
            handlePauseAndResume();
        } else if (e instanceof RestartCycleSignal) {
            roundIdx = 0;
            sellsDoneThisRound = false;
            resetAfterHarvest = false;
            skipToHarvestOnce = false;
            skipWaitOnce = false;
            pendingMenuAlreadyOpen = false;
            log('[轮种] 爆仓变卖完成，从第1轮（小麦）重新开始');
        } else if (e instanceof RecoveredCycleSignal) {
            // [改] e.mode 已经在 recoverFromFreeze 里按 plantDone 判定过：'harvest'=本轮已种完，续接读秒等收割；'plant'=本轮还没种，重新种。
            skipToHarvestOnce = (e.mode === 'harvest');
            pendingMenuAlreadyOpen = e.menuAlreadyOpen;
            if (e.mode === 'plant') {
                // 跳过下一轮气泡检测，防止外面还有残留没清干净。
                bubbleDetectSuspended = true;
                log('[FreezeRecovery] 回中后本轮还没种下去（plantDone=false），改为重新种植本轮，并标记跳过下一轮鸡场/马场气泡检测');
            }
            log('[FreezeRecovery] 恢复流程结束，下一轮将' + (skipToHarvestOnce ? '继续等待成熟并收割当前这一轮' : '重新种植当前这一轮') + '，衔接主循环继续');
        } else {
            toastLog("主循环异常：" + (e && e.message ? e.message : e));
            log("完整异常堆栈: " + e);
            sleep(3000);
        }
    }
}
