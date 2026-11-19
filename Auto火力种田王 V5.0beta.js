// ================= Auto火力种田王V5.0（换挡版） =================
// 自动挡（良田+水稻-大豆-2甘蔗轮值，2甘蔗Debuff转玉米） + 手动挡（六挡作物 / 2玉米（上）-1南瓜（下） / 纯良田）
// 手动挡作物长按1秒可转该作物的一阶段debuff阶段，关闭上方田地后则不提供“玉米-南瓜”选项。
// 滑动变速旨在适应想用虚拟机挂机的场景（因为在作物经验上限大幅提高的场景，很难做到全天候手植）。目前虚拟机可以完美适应畜牧业和良田常驻，种地的话速度调到30%倒也还行，就是避免不了很多漏植。晚间当然最好还是用真机挂机，其余时间可以用虚拟机挂机，虚拟机的使用方法自行问AI看看，稍微有点繁琐。
// 提示：驿站绿点检测有两个时机：每次收割后检测一次，以及每两分钟良田检测一次。请把良田视角上的驿站绿点位置替换成泥土地，保证驿站检测正确。
// 请确认使用自动挡脚本时布告栏处于正确位置，并有至少有一个任务待完成，以实现断线回中功能。
// 悬浮窗请置于左上人物名片处，避开最左上角驿站水域检测。运行脚本第一轮水稻时，最好手动做两次偏移，提前压测一下断线回中机制是否能正常运行，屏幕是否会出现拉伸导致UI向两侧挤开（这可能会导致屯田图标漂移，以及safeclose点位出现在建造图标上）。在确保没问题后，尽量不要再暂停切屏重启游戏，不然屏幕显示可能会不稳定。

auto.waitFor();
floaty.closeAll();
setScreenMetrics(2412, 1080);

// ==================== 控制面板 ====================
var PANEL = {
    DRIVE_MODE: 'manual',             // 默认模式：'manual'=手动挡，'auto'=自动挡（会自动记忆上次选择）
    MANUAL_DEFAULT_GEAR: 'soy',       // 手动挡默认挡位：'soy'(大豆) | 'wheat'(小麦) | 'rice'(水稻) | 'cane'(甘蔗) | 'corn'(玉米) | 'pumpkin'(南瓜) | 'corn_pumpkin'(玉米南瓜) | 'fertile'(良田)
    WHEAT_COOLDOWN_SEC: 120,          // 小麦成熟秒数（2分钟；长按减益为240秒）
    RICE_COOLDOWN_SEC: 300,           // 水稻成熟秒数（5分钟；长按减益为600秒）
    SOY_COOLDOWN_SEC: 600,            // 大豆成熟秒数（10分钟；长按减益为1080秒）
    CANE_COOLDOWN_SEC: 1800,          // 甘蔗成熟秒数（30分钟；长按减益为3600秒）
    CORN_COOLDOWN_SEC: 3600,          // 玉米成熟秒数（60分钟）
    PUMPKIN_COOLDOWN_SEC: 7200,       // 南瓜成熟秒数（120分钟）
    FERTILE_INTERVAL_SEC: 120,        // 良田小麦成熟秒数（2分钟；长按减益为240秒）
    FACTORY_FEED_PULLS: 5,            // 鸡舍铡刀坊拖拽次数
    CHOP_FEED_PULLS: 6,               // 马厩铡刀坊拖拽次数
    BUBBLE_POLL_SEC: 5,               // 气泡检测间隔秒数
    LOBBY_ENTER_FARM_BTN: [215, 645], // 屯田回城坐标
    FERTILE_REF_P1: [1747, 404],      // 良田视角左鸡舍屋顶参考框左上角
    FERTILE_REF_P2: [1823, 437]       // 良田视角左鸡舍屋顶参考框右下角
};

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
        }
    } catch (e) {}
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
    return null;
}

// ================= 全局坐标与参数配置 =================
var CONFIG = {
    CENTER_TILE: [1200, 540],
    targetTile: [1200, 540],
    seedIcon: [740, 910],
    riceSeedIcon: [935, 900],
    soySeedIcon: [1111, 900],
    cornSeedIcon: [1480, 910],
    pumpkinSeedIcon: [1740, 910],
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
    bubble_CT: [1280, 110],           // 鸡舍上铡刀坊气泡 (chicken top)
    bubble_CB: [1320, 430],           // 鸡舍下铡刀坊气泡 (chicken bottom)
    bubble_CL: [660, 220],            // 左鸡舍气泡 (chicken left)
    bubble_CR: [1750, 220],           // 右鸡舍气泡 (chicken right)
    build_FT: [1320, 400], enter_FT: [1240, 285],
    build_FB: [1320, 700], enter_FB: [1240, 360],
    build_CL: [590, 700],  enter_CL: [590, 390],
    build_CR: [1670, 700], enter_CR: [1670, 390],
    factoryFeedIcon: [1025, 910],
    coopFeedIcon: [1220, 940],
    coopChicken1: [580, 540],
    coopChicken6: [1880, 540],
    bubble_HL: [195, 853],            // 左马厩气泡 (horse left)
    bubble_HR: [1060, 853],           // 右马厩气泡 (horse right)
    bubble_HC: [665, 1060],           // 马厩下铡刀坊气泡 (horse chop)
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
    readyBufferMs: 1000,              // 主田收割延迟1秒（1000ms），防抢收触发加速弹窗
    holdMs: 400,
    BUBBLE_STOP_BEFORE_READY_SEC: 20,
    FERTILE_NO_CHICKEN_SELL_SEC: 1800,
    FERTILE_NO_CHICKEN_WHEAT_SELLS: 2,
    exitGameBtn: [2222, 60],
    lobbyEnterFarmBtn: PANEL.LOBBY_ENTER_FARM_BTN,
    noticeBoardRecenterBtn: [1108, 1028],
    disconnectDialogCheckRegion: [900, 300, 600, 100],
    disconnectDialogUniformTolerance: 25,
    disconnectDialogMinBrightness: 200,
    disconnectDialogColorRef: [251, 244, 216],
    disconnectDialogColorTolerance: 30,
    disconnectDialogReconnectBtn: [1380, 670],
    debuffCheckRegions: [
        [462, 162, 76, 76], // (500, 200) 附近区域
        [562, 162, 76, 76]  // (600, 200) 附近区域
    ],
    debuffTargetColor: [254, 139, 85],
    debuffColorTolerance: 20,
    debuffMinPixels: 30,
    stationGoodsCheckPoint: [2067, 910],
    stationGoodsColor: [100, 166, 65],
    stationGoodsColorTolerance: 25,
    stationIcon: [2020, 965],
    stationHarvestBtn: [2070, 975],
    stationLoadBtn: [2070, 785],
    stationScreenCheckPoint: [75, 115],
    stationScreenColor: [96, 196, 196],
    stationScreenColorTolerance: 25,
    sickleMenuRegion: [1100, 750, 240, 240]
};
CONFIG.caneSeedIcon = CONFIG.sickleIcon;

var PARAMS = {
    wheat:   { topY: 151, bottomY: 926, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.seedIcon,        loop1Ms: 36, loop2Ms: 17, loop3Ms: 15 },
    rice:    { topY: 151, bottomY: 926, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.riceSeedIcon,    loop1Ms: 36, loop2Ms: 21, loop3Ms: 20 },
    soy:     { topY: 151, bottomY: 925, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.soySeedIcon,     loop1Ms: 36, loop2Ms: 21, loop3Ms: 20 },
    cane:    { topY: 151, bottomY: 926, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.caneSeedIcon,    loop1Ms: 36, loop2Ms: 18, loop3Ms: 14 },
    corn:    { topY: 151, bottomY: 923, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.cornSeedIcon,    loop1Ms: 36, loop2Ms: 18, loop3Ms: 14 },
    pumpkin: { topY: 151, bottomY: 926, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.pumpkinSeedIcon, loop1Ms: 36, loop2Ms: 18, loop3Ms: 14 },
    sickle:  { topY: 151, bottomY: 926, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.sickleIcon,      loop1Ms: 36, loop2Ms: 18, loop3Ms: 14 }
};
CONFIG.LOOP_COUNT = 3;

// 作物基础配置与减益(Debuff)后冷却秒数：小麦4m(240s)、水稻10m(600s)、大豆18m(1080s)、甘蔗60m(3600s)
var CROPS = {
    wheat:   { label: '小麦', plantKey: 'wheat',   harvestKey: 'sickle', seedIcon: CONFIG.seedIcon,        cooldownSec: PANEL.WHEAT_COOLDOWN_SEC,   debuffSec: 240,  slot: CONFIG.wheatSlotInWarehouse, sellBtn: CONFIG.sellBtn },
    rice:    { label: '水稻', plantKey: 'rice',    harvestKey: 'sickle', seedIcon: CONFIG.riceSeedIcon,    cooldownSec: PANEL.RICE_COOLDOWN_SEC,    debuffSec: 600,  slot: CONFIG.riceSlotInWarehouse,  sellBtn: CONFIG.riceSellBtn },
    soy:     { label: '大豆', plantKey: 'soy',     harvestKey: 'sickle', seedIcon: CONFIG.soySeedIcon,     cooldownSec: PANEL.SOY_COOLDOWN_SEC,     debuffSec: 1080, slot: CONFIG.soySlotInWarehouse,   sellBtn: CONFIG.soySellBtn },
    cane:    { label: '甘蔗', plantKey: 'cane',    harvestKey: 'sickle', seedIcon: CONFIG.caneSeedIcon,    cooldownSec: PANEL.CANE_COOLDOWN_SEC,    debuffSec: 3600, slot: CONFIG.caneSlotInWarehouse,  sellBtn: CONFIG.caneSellBtn },
    corn:    { label: '玉米', plantKey: 'corn',    harvestKey: 'sickle', seedIcon: CONFIG.cornSeedIcon,    cooldownSec: PANEL.CORN_COOLDOWN_SEC,    debuffSec: 3600, slot: CONFIG.cornSlotInWarehouse,  sellBtn: CONFIG.cornSellBtn },
    pumpkin: { label: '南瓜', plantKey: 'pumpkin', harvestKey: 'sickle', seedIcon: CONFIG.pumpkinSeedIcon, cooldownSec: PANEL.PUMPKIN_COOLDOWN_SEC, debuffSec: 7200, slot: null,                        sellBtn: null }
};

// 手动挡长按1秒切换减益状态（每次重启脚本自动重置为全绿false，不持久化）
var debuffGearState = {
    wheat: false,
    rice: false,
    soy: false,
    cane: false,
    fertile: false
};
var fertileDebuffApplyToAll = false; // 当良田开启减益且弹窗选“是”时，其他流程去良田也沿用240s

function isCropInDebuff(cropKey) {
    if (currentDriveMode !== 'manual') return false;
    return !!debuffGearState[cropKey];
}
function getCropDisplayName(cropKey) {
    var c = CROPS[cropKey];
    if (!c) return '';
    return c.label + (isCropInDebuff(cropKey) ? '（减益）' : '');
}
function getCropCooldownSec(cropKey) {
    var c = CROPS[cropKey];
    if (!c) return PANEL.SOY_COOLDOWN_SEC;
    if (cropKey === 'wheat' && inOverflowWheatRescue) return PANEL.WHEAT_COOLDOWN_SEC;
    if (isCropInDebuff(cropKey)) return c.debuffSec;
    return c.cooldownSec;
}
function getFertileCooldownSec() {
    if (currentDriveMode === 'manual' && currentManualGear === 'fertile') {
        return debuffGearState.fertile ? 240 : PANEL.FERTILE_INTERVAL_SEC;
    }
    if (fertileDebuffApplyToAll && debuffGearState.fertile) {
        return 240;
    }
    return PANEL.FERTILE_INTERVAL_SEC;
}

// ================= [良田] 参数 =================
var FERTILE = {
    ENTER_BTN: [60, 480],
    BACK_BTN: [2200, 570],
    SAFE_CLOSE: null,
    ENTER_WAIT_MS: 500,
    TRIPLE_GAP_MS: 80,
    STEP_GAP_MS: 200,                 // 0.2s间隔
    BACK_WAIT_MS: 1000,
    HOLD_PTS: 7,
    MOVE_STEPS: 10,
    MS_PER_PT: 25,
    STATION_CHECK_DELAY_MS: 200,
    PRE_DRAG_MS: 150,                 // 三连点后到拖种子前的间隔（也是爆仓截图判定前的等待，弹窗出得慢就调大）
    READY_BUFFER_MS: 1000,            // 读秒到点后再多等1秒，确保小麦真熟了才点，防止点到未熟小麦后空拖
    FULL_RETRY_MAX: 3                 // 纯良田连续爆仓清仓重试上限，超过则暂停
};

// ================= [上方新田地] 参数 =================
var UPPER_FIELD = {
    ENTER_BTN: [2036, 160],
    ENTER_WAIT_MS: 1000,
    BACK_BTN: [1405, 1054],
    BACK_WAIT_MS: 1000,
    HARVEST_FIRST: 1
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
    baseSpeed: 0.5,
    ORIG_PX_PER_PT: 63,
    POINT_MS: 25,
    HOLD_PTS: 7,
    WARMUP_CIRCLES: 3,
    WARMUP_RADIUS: 25,
    WARMUP_PTS: 10,
    SETTLE_PTS: 4,
    menuWaitMs: 700
};

// ================= 校准与全部悬浮窗设置持久化 =================
var calibStorage = storages.create('wheat_farm_calib');
var uiStorage = storages.create('wheat_farm_ui_v5');

var chickenCalibrated = !!calibStorage.get('chickenCalibrated', false);
var ranchCalibrated = !!calibStorage.get('ranchCalibrated', false);
var fertileCalibrated = !!calibStorage.get('fertileCalibrated', false);
if (chickenCalibrated) {
    CONFIG.eggSlotInWarehouse = calibStorage.get('eggSlot', null);
    CONFIG.eggSellBtn = calibStorage.get('eggBtn', null);
}
if (ranchCalibrated) {
    CONFIG.milkSlotInWarehouse = calibStorage.get('milkSlot', null);
    CONFIG.milkSellBtn = calibStorage.get('milkBtn', null);
}
if (fertileCalibrated) {
    FERTILE.SAFE_CLOSE = calibStorage.get('fertileSafeClose', null);
}

// 永久保存上一次调好的滑动速率（两挡同步生效）及所有悬浮窗配置
var speedSliderPos = uiStorage.get('speedSliderPos', calibStorage.get('speedSliderPos', 1.0));
if (typeof speedSliderPos !== 'number' || isNaN(speedSliderPos)) speedSliderPos = 1.0;
speedSliderPos = Math.max(0, Math.min(1, speedSliderPos));

// 自动挡开关配置（默认全开）
var AUTO_OPTS = {
    upper:       uiStorage.get('auto_upper', 1),
    chicken:     uiStorage.get('auto_chicken', 1),
    ranch:       uiStorage.get('auto_ranch', 1),
    stationLoad: uiStorage.get('auto_stationLoad', 1),
    driftCheck:  uiStorage.get('auto_driftCheck', 1)
};
// 手动挡开关配置（上方田地/鸡舍/马厩默认开，自动装载/偏移检测默认关）
var MANUAL_OPTS = {
    upper:       uiStorage.get('manual_upper', 1),
    chicken:     uiStorage.get('manual_chicken', 1),
    ranch:       uiStorage.get('manual_ranch', 1),
    stationLoad: uiStorage.get('manual_stationLoad', 0),
    driftCheck:  uiStorage.get('manual_driftCheck', 0)
};

var currentDriveMode = uiStorage.get('driveMode', PANEL.DRIVE_MODE);
if (currentDriveMode !== 'auto' && currentDriveMode !== 'manual') currentDriveMode = 'manual';
var nextDriveMode = currentDriveMode;

var currentManualGear = uiStorage.get('manualGear', PANEL.MANUAL_DEFAULT_GEAR);
var VALID_GEARS = { wheat: 1, rice: 1, soy: 1, cane: 1, corn: 1, pumpkin: 1, corn_pumpkin: 1, fertile: 1 };
if (!VALID_GEARS[currentManualGear]) currentManualGear = 'soy';
if (!MANUAL_OPTS.upper && currentManualGear === 'corn_pumpkin') currentManualGear = 'soy';
var nextManualGear = currentManualGear;

function saveUIConfig() {
    uiStorage.put('speedSliderPos', speedSliderPos);
    uiStorage.put('driveMode', nextDriveMode);
    uiStorage.put('manualGear', nextManualGear);
    uiStorage.put('auto_upper', AUTO_OPTS.upper);
    uiStorage.put('auto_chicken', AUTO_OPTS.chicken);
    uiStorage.put('auto_ranch', AUTO_OPTS.ranch);
    uiStorage.put('auto_stationLoad', AUTO_OPTS.stationLoad);
    uiStorage.put('auto_driftCheck', AUTO_OPTS.driftCheck);
    uiStorage.put('manual_upper', MANUAL_OPTS.upper);
    uiStorage.put('manual_chicken', MANUAL_OPTS.chicken);
    uiStorage.put('manual_ranch', MANUAL_OPTS.ranch);
    uiStorage.put('manual_stationLoad', MANUAL_OPTS.stationLoad);
    uiStorage.put('manual_driftCheck', MANUAL_OPTS.driftCheck);
}

// 始终读取当前悬浮窗选中的挡位（nextDriveMode）上的开关配置，无论切过自动挡还是手动挡都立即按当前面板所选执行
function getActiveOpts(mode) {
    var m = mode || nextDriveMode || currentDriveMode;
    return (m === 'auto') ? AUTO_OPTS : MANUAL_OPTS;
}
function isUpperEnabled()     { return !!getActiveOpts().upper; }
function isChickenEnabled()   { return !!getActiveOpts().chicken; }
function isRanchEnabled()     { return !!getActiveOpts().ranch; }
function isStationLoadOn()    { return !!getActiveOpts().stationLoad; }
function isDriftCheckOn()     { return !!getActiveOpts().driftCheck; }

// 滑动变速计算（两挡同步生效，种植和镰刀同时变化）：
// - s=1.0（最右）：下方速度 1.00，上方速度 0.75（即 baseSpeed=0.5）
// - 左滑前1/3至黄色刻度 s=2/3：上方速度保持 0.75 不变；下方从 1.00 匀降至 0.75，在黄色刻度处上下速度完全相同
// - 继续左滑后2/3至最左 s=0.0：上下速度以完全相同的变化率（斜率0.75）同步匀降至 0.25
function getLowerSpeedFactor() {
    return 0.25 + 0.75 * speedSliderPos;
}
function getUpperEffectiveSpeed() {
    var YELLOW_TICK = 2.0 / 3.0;
    if (speedSliderPos >= YELLOW_TICK) {
        return CORN_SWEEP.baseSpeed;
    }
    var rel = 0.25 + 0.75 * speedSliderPos;
    return CORN_SWEEP.baseSpeed * (rel / 0.75);
}
function formatSpeedLabel() {
    return Math.round(speedSliderPos * 100) + "%";
}

// ================= 三块田地独立持久化计时器（绝不因换挡或暂停继续而丢失进度） =================
// 1. 主田计时器
var hasEverPlantedMainField = false;
var mainPlantedCrop = null;
var lastPlantTime = 0;
var mainFieldReadyAt = 0;

// 2. 上方田地计时器
var upperPlantedCrop = null;
var upperLastPlantTime = 0;
var upperFieldReadyAt = 0;

// 3. 良田计时器（常规挂机与纯良田挂机共享同一份良田读秒数据）
var fertileLastPlantTime = 0;
var fertileFieldReadyAt = 0;

function recordMainFieldPlanted(cropKey) {
    hasEverPlantedMainField = true;
    mainPlantedCrop = cropKey;
    lastPlantTime = Date.now();
    var cdSec = getCropCooldownSec(cropKey);
    mainFieldReadyAt = lastPlantTime + cdSec * 1000 + CONFIG.readyBufferMs;
    plantDone = true;
}
function recordUpperFieldPlanted(cropKey) {
    upperPlantedCrop = cropKey;
    upperLastPlantTime = Date.now();
    var cdSec = getCropCooldownSec(cropKey);
    upperFieldReadyAt = upperLastPlantTime + cdSec * 1000 + 2000;
}
function fertileReadyAtFrom(plantTime) {
    return plantTime + getFertileCooldownSec() * 1000 + FERTILE.READY_BUFFER_MS;
}
function recordFertileFieldPlanted() {
    fertileLastPlantTime = Date.now();
    fertileFieldReadyAt = fertileReadyAtFrom(fertileLastPlantTime);
}

function getCropReadyAt() {
    return mainFieldReadyAt;
}
function isCropReadyNow() {
    return mainFieldReadyAt <= 0 || Date.now() >= mainFieldReadyAt;
}
function extendWaitTimerForUnripeCrop(minRemainSec) {
    var waitSec = Math.max(15, minRemainSec || 20);
    var targetReadyAt = Date.now() + waitSec * 1000;
    if (mainFieldReadyAt < targetReadyAt) {
        mainFieldReadyAt = targetReadyAt;
    }
    plantDone = true;
}

// ================= 自动挡状态与运行变量 =================
var AUTO_NORMAL_STEPS = [
    { crop: 'rice', sellTimes: 1 },
    { crop: 'soy',  sellTimes: 2 },
    { crop: 'cane', sellTimes: 3 },
    { crop: 'cane', sellTimes: 3 }
];
var AUTO_TAIL_STEPS = [
    { crop: 'rice', sellTimes: 1 },
    { crop: 'soy',  sellTimes: 2 }
];
var autoPhase = 'normal';
var autoStepIdx = 0;
var autoDebuffTriggered = false;
var autoCurrentRoundNoSell = false;
var autoCornRoundCount = 0;
var autoPendingSellCrop = null;
var autoPendingSellTimes = 0;

var currentCrop = (currentDriveMode === 'auto')
    ? 'rice'
    : (currentManualGear === 'corn_pumpkin' ? 'pumpkin' : (CROPS[currentManualGear] ? currentManualGear : 'soy'));

var CHICKEN_TIMEOUT_MS = 25 * 60 * 1000;
var RANCH_TIMEOUT_MS = 65 * 60 * 1000;
var chickenLeftNoBubbleSince = 0;
var chickenRightNoBubbleSince = 0;
var ranchLeftNoBubbleSince = 0;
var ranchRightNoBubbleSince = 0;
var needSellWheat = false;
var needSellEggs = false;
var needSellMilk = false;
var lastNoChickenWheatSellTime = Date.now();
var bubbleFlowActive = false;
var bubbleDetectSuspended = false;
var stationGoodsPending = false;
var plantDone = false;
var warehouseTripCount = 0;
var centerTouched = false;
var chickenRunCount = 0;
var ranchRunCount = 0;
var pauseRanchAfterRiceOverflow = false;
var cornPumpkinSecondCornDone = false;
var inOverflowWheatRescue = false;
var savedCropBeforeRescue = null;
var extraOverflowWheatSells = 0;
var roundWarehouseAlreadySold = false;

// ================= 悬浮控制/暂停状态 =================
var CTRL = {
    paused: true,
    settingsOpen: false,
    actionInProgress: false,
    currentPhase: 'plant'
};
var skipToHarvestOnce = false;
var skipWaitOnce = false;
var pendingMenuAlreadyOpen = false;
var pauseTriggered = false;
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
        if (CTRL.paused || pauseTriggered) {
            throw new PauseSignal();
        }
    }
}
function sleepWithHeartbeat(ms) {
    var remain = ms, chunk = 1000;
    while (remain > 0) {
        var t = Math.min(chunk, remain);
        sleep(t);
        remain -= t;
        renewLock();
        if (CTRL.paused || pauseTriggered) {
            throw new PauseSignal();
        }
    }
}
function setActionInProgress(val) {
    CTRL.actionInProgress = val;
}
function beginAction() {
    if (CTRL.settingsOpen) {
        forceCloseSettingsPanel();
    }
    setActionInProgress(true);
}
function pauseScriptOnOffset(reasonText) {
    toastLog(reasonText);
    CTRL.paused = true;
    pauseTriggered = true;
    syncUI();
    throw new PauseSignal();
}

// ================= 中心土地防连点 =================
function clickSafeClose() {
    click(CONFIG.SAFE_CLOSE[0], CONFIG.SAFE_CLOSE[1]);
    centerTouched = false;
}
function ensureCenterClean() {
    if (CTRL.paused || pauseTriggered) throw new PauseSignal();
    if (centerTouched) {
        clickSafeClose();
        pausableSleep(400);
    }
}
function clickCenterTile(x, y) {
    ensureCenterClean();
    click(x, y);
    centerTouched = true;
}

// ================= 双轨参考图（主田参考图 referencePatch 与 良田参考图 fertileReferencePatch 严格独立） =================
var ctrlWin = null;
var referencePatch = null;
var REF_REGION = [1606, 354, 106, 78];
var DRIFT_SEARCH_MARGIN = 40;
var RECOVER_MAX_ATTEMPTS = 6;      // 回中连续失败上限（遇到断线弹窗不计入），超过则暂停，避免无限盲点
var BUBBLE_MAX_OFFSET_PX = 15;     // 点建筑菜单前允许的基准图偏移像素，超过则不点（防误点旋转/移动）

var fertileReferencePatch = null;
var FERTILE_REF_REGION = [
    Math.min(PANEL.FERTILE_REF_P1[0], PANEL.FERTILE_REF_P2[0]),
    Math.min(PANEL.FERTILE_REF_P1[1], PANEL.FERTILE_REF_P2[1]),
    Math.abs(PANEL.FERTILE_REF_P2[0] - PANEL.FERTILE_REF_P1[0]),
    Math.abs(PANEL.FERTILE_REF_P2[1] - PANEL.FERTILE_REF_P1[1])
];
var FERTILE_DRIFT_MARGIN = 35;

function captureReferencePatch() {
    var img = safeCaptureScreen();
    if (!img) return;
    if (referencePatch) referencePatch.recycle();
    referencePatch = images.clip(img, REF_REGION[0], REF_REGION[1], REF_REGION[2], REF_REGION[3]);
    img.recycle();
    log('[主田基准图] 已采集中心画面基准图');
}

function captureFertileReferencePatch() {
    var img = safeCaptureScreen();
    if (!img) return;
    if (fertileReferencePatch) fertileReferencePatch.recycle();
    fertileReferencePatch = images.clip(img, FERTILE_REF_REGION[0], FERTILE_REF_REGION[1], FERTILE_REF_REGION[2], FERTILE_REF_REGION[3]);
    img.recycle();
    log('[良田基准图] 已采集良田左鸡舍屋顶基准图 ' + JSON.stringify(FERTILE_REF_REGION));
}

function matchFertileReference(img) {
    if (!fertileReferencePatch || !img) return true;
    try {
        var searchRegion = [
            Math.max(0, FERTILE_REF_REGION[0] - FERTILE_DRIFT_MARGIN),
            Math.max(0, FERTILE_REF_REGION[1] - FERTILE_DRIFT_MARGIN),
            FERTILE_REF_REGION[2] + FERTILE_DRIFT_MARGIN * 2,
            FERTILE_REF_REGION[3] + FERTILE_DRIFT_MARGIN * 2
        ];
        var pt = images.findImage(img, fertileReferencePatch, {
            region: searchRegion,
            threshold: 0.8
        });
        return pt !== null;
    } catch (e) {
        return true;
    }
}

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
    var x0 = region[0], y0 = region[1], w = region[2], h = region[3];
    var first = images.pixel(img, x0, y0);
    var step = 8;
    for (var dx = 0; dx < w; dx += step) {
        for (var dy = 0; dy < h; dy += step) {
            var c = images.pixel(img, x0 + dx, y0 + dy);
            var diff = Math.max(
                Math.abs(colors.red(c) - colors.red(first)),
                Math.abs(colors.green(c) - colors.green(first)),
                Math.abs(colors.blue(c) - colors.blue(first))
            );
            if (diff > tolerance) return false;
        }
    }
    return true;
}
function regionAvgColor(img, region) {
    var x0 = region[0], y0 = region[1], w = region[2], h = region[3];
    var sumR = 0, sumG = 0, sumB = 0, count = 0, step = 8;
    for (var dx = 0; dx < w; dx += step) {
        for (var dy = 0; dy < h; dy += step) {
            var c = images.pixel(img, x0 + dx, y0 + dy);
            sumR += colors.red(c); sumG += colors.green(c); sumB += colors.blue(c);
            count++;
        }
    }
    return count > 0 ? [Math.round(sumR / count), Math.round(sumG / count), Math.round(sumB / count)] : [0, 0, 0];
}
function regionMatchesRefColor(img, region, refColor, tolerance) {
    var avg = regionAvgColor(img, region);
    var diff = Math.max(
        Math.abs(avg[0] - refColor[0]),
        Math.abs(avg[1] - refColor[1]),
        Math.abs(avg[2] - refColor[2])
    );
    return diff <= tolerance;
}
function regionHasColorNear(img, cx, cy, radius, targetColor, tolerance, minPixels) {
    var count = 0, step = 4;
    var x0 = Math.max(0, cx - radius), y0 = Math.max(0, cy - radius);
    var x1 = Math.min(img.getWidth() - 1, cx + radius), y1 = Math.min(img.getHeight() - 1, cy + radius);
    for (var x = x0; x <= x1; x += step) {
        for (var y = y0; y <= y1; y += step) {
            var c = images.pixel(img, x, y);
            var diff = Math.max(
                Math.abs(colors.red(c) - targetColor[0]),
                Math.abs(colors.green(c) - targetColor[1]),
                Math.abs(colors.blue(c) - targetColor[2])
            );
            if (diff <= tolerance) {
                count++;
                if (count >= minPixels) return true;
            }
        }
    }
    return false;
}

// ================= 偏移检测 (DriftGuard) =================
// 基准图当前相对原位的偏移（像素）。找不到或坐标系异常返回 null
function getReferenceOffset(img) {
    if (!referencePatch || !img) return null;
    try {
        var searchRegion = [
            Math.max(0, REF_REGION[0] - DRIFT_SEARCH_MARGIN),
            Math.max(0, REF_REGION[1] - DRIFT_SEARCH_MARGIN),
            REF_REGION[2] + DRIFT_SEARCH_MARGIN * 2,
            REF_REGION[3] + DRIFT_SEARCH_MARGIN * 2
        ];
        var pt = images.findImage(img, referencePatch, { region: searchRegion, threshold: 0.8 });
        if (!pt) return null;
        var dx = pt.x - REF_REGION[0], dy = pt.y - REF_REGION[1];
        if (Math.abs(dx) > DRIFT_SEARCH_MARGIN + 10 || Math.abs(dy) > DRIFT_SEARCH_MARGIN + 10) return null;
        return [dx, dy];
    } catch (e) {
        return null;
    }
}
function isOffsetTooBig(off) {
    return !!off && Math.max(Math.abs(off[0]), Math.abs(off[1])) > BUBBLE_MAX_OFFSET_PX;
}
// 回中没对上时留证据：存整屏图，并写明是"整屏找不到基准图"（基准区的建筑被转/移，或被弹窗遮住）还是"只是位置偏了"
function diagnoseReferenceMiss(tag, img) {
    try {
        DriftGuard.saveDebugImg(img, tag);
        if (!referencePatch) return;
        var pt = images.findImage(img, referencePatch, { threshold: 0.8 });
        if (pt) {
            log('[回中诊断] ' + tag + '：整屏能找到基准图，偏移 dx=' + (pt.x - REF_REGION[0]) + ' dy=' + (pt.y - REF_REGION[1]));
        } else {
            log('[回中诊断] ' + tag + '：整屏找不到基准图（基准区域的建筑被转动/移动，或被弹窗遮住），截图已存 ' + DEBUG_DIR);
        }
    } catch (e) {}
}
// 裁剪当前回中尝试的特征块（用于第n+1张与第n张比对，判断画面是否卡死/原地死循环；比对后立即recycle防内存泄漏）
function clipAttemptPatch(img) {
    if (!img) return null;
    try {
        return images.clip(img, REF_REGION[0], REF_REGION[1], REF_REGION[2], REF_REGION[3]);
    } catch (e) {
        return null;
    }
}
function isSameAsPrevAttempt(img, prevPatch) {
    if (!img || !prevPatch) return false;
    try {
        var searchRegion = [
            Math.max(0, REF_REGION[0] - DRIFT_SEARCH_MARGIN),
            Math.max(0, REF_REGION[1] - DRIFT_SEARCH_MARGIN),
            REF_REGION[2] + DRIFT_SEARCH_MARGIN * 2,
            REF_REGION[3] + DRIFT_SEARCH_MARGIN * 2
        ];
        var pt = images.findImage(img, prevPatch, { region: searchRegion, threshold: 0.85 });
        return pt !== null;
    } catch (e) {
        return false;
    }
}

var DriftGuard = {
    suspected: false,
    reset: function () { this.suspected = false; },
    matchReference: function (img) {
        if (!referencePatch) return true;
        try {
            var searchRegion = [
                Math.max(0, REF_REGION[0] - DRIFT_SEARCH_MARGIN),
                Math.max(0, REF_REGION[1] - DRIFT_SEARCH_MARGIN),
                REF_REGION[2] + DRIFT_SEARCH_MARGIN * 2,
                REF_REGION[3] + DRIFT_SEARCH_MARGIN * 2
            ];
            var pt = images.findImage(img, referencePatch, {
                region: searchRegion,
                threshold: 0.8
            });
            return pt !== null;
        } catch (e) {
            return true;
        }
    },
    isWarehouseFull: function (img) {
        var r = CONFIG.warehouseFullCheckRegion;
        if (!isRegionUniform(img, r, CONFIG.warehouseFullUniformTolerance)) return false;
        return regionMatchesRefColor(img, r, CONFIG.warehouseFullColorRef, CONFIG.warehouseFullColorTolerance);
    },
    saveDebugImg: function (img, tag) {
        try {
            var ts = new java.text.SimpleDateFormat('yyyyMMdd_HHmmss_SSS').format(new Date());
            images.save(img, DEBUG_DIR + ts + '_' + tag + '.png');
        } catch (e) {}
    },
    onBubblesFound: function () {
        if (this.suspected) this.suspected = false;
    },
    midFlowRecheck: function () {
        if (CTRL.settingsOpen || CTRL.paused || bubbleFlowActive) return 'ok';
        var img = safeCaptureScreen();
        if (!img) return 'ok';
        if (this.matchReference(img)) {
            this.suspected = false;
            img.recycle();
            return 'ok';
        }
        if (this.isWarehouseFull(img)) {
            this.saveDebugImg(img, 'midflow_wfull');
            img.recycle();
            this.suspected = false;
            return 'warehouseFull';
        }
        img.recycle();
        if (!isDriftCheckOn()) {
            pauseScriptOnOffset("检测到画面偏移，已自动暂停");
        }
        // 先点SafeClose消弹窗再复核一次（已在中心，不再点上方田地返回键）
        clickSafeClose();
        sleep(500);
        var img2 = safeCaptureScreen();
        if (!img2) return 'ok';
        if (this.matchReference(img2)) {
            img2.recycle();
            return 'ok';
        }
        if (this.isWarehouseFull(img2)) {
            img2.recycle();
            return 'warehouseFull';
        }
        img2.recycle();
        return 'drift';
    },
    softCheck: function (stepName) {
        if (CTRL.settingsOpen || CTRL.paused) return 'ok';
        var img = safeCaptureScreen();
        if (!img) return 'ok';
        if (this.matchReference(img)) {
            this.suspected = false;
            img.recycle();
            return 'ok';
        }
        if (this.isWarehouseFull(img)) {
            this.saveDebugImg(img, '1_wfull_' + stepName);
            img.recycle();
            this.suspected = false;
            return 'warehouseFull';
        }
        img.recycle();
        this.suspected = true;
        return 'suspected';
    },
    finalCheck: function (stepName) {
        if (CTRL.settingsOpen || CTRL.paused) return 'ok';
        var img = safeCaptureScreen();
        if (!img) return 'ok';
        if (this.matchReference(img)) {
            this.suspected = false;
            img.recycle();
            return 'ok';
        }
        if (this.isWarehouseFull(img)) {
            this.saveDebugImg(img, '2_wfull_' + stepName);
            img.recycle();
            this.suspected = false;
            return 'warehouseFull';
        }
        img.recycle();
        if (!isDriftCheckOn()) {
            pauseScriptOnOffset("检测到画面偏移，已自动暂停");
        }
        // 先点SafeClose消弹窗再复核一次（已在中心，不再点上方田地返回键）
        clickSafeClose();
        sleep(500);
        var img3 = safeCaptureScreen();
        if (img3) {
            if (this.matchReference(img3)) {
                this.suspected = false;
                img3.recycle();
                return 'ok';
            }
            if (this.isWarehouseFull(img3)) {
                img3.recycle();
                this.suspected = false;
                return 'warehouseFull';
            }
            this.saveDebugImg(img3, '3_check3_' + stepName);
            img3.recycle();
        }
        return 'drift';
    },
    checkWaitCenter: function () {
        if (CTRL.settingsOpen || CTRL.paused || bubbleFlowActive) return 'ok';
        var img = safeCaptureScreen();
        if (!img) return 'ok';
        if (this.matchReference(img)) {
            img.recycle();
            return 'ok';
        }
        if (this.isWarehouseFull(img)) {
            img.recycle();
            return 'warehouseFull';
        }
        img.recycle();
        // 若关闭了偏移检测，常驻轮询期间允许自由拖屏，不触发重连或暂停
        if (!isDriftCheckOn()) return 'ok';
        sleep(600);
        var img2 = safeCaptureScreen();
        if (!img2) return 'ok';
        if (this.matchReference(img2)) {
            img2.recycle();
            return 'ok';
        }
        if (this.isWarehouseFull(img2)) {
            img2.recycle();
            return 'warehouseFull';
        }
        img2.recycle();
        // 先点SafeClose消弹窗再复核一次（已在中心，不再点上方田地返回键）
        clickSafeClose();
        sleep(500);
        var img3 = safeCaptureScreen();
        if (!img3) return 'ok';
        if (this.matchReference(img3)) {
            img3.recycle();
            return 'ok';
        }
        this.saveDebugImg(img3, 'wait_poll_drift');
        img3.recycle();
        return 'drift';
    },
    // 当偏移检测关闭时，在即将到达良田或主田收割前的第一次进入小于间隔时间（如剩4秒）核对是否偏移，若偏移则自动暂停
    ensureCenteredBeforeDueAction: function (actionLabel) {
        var img = safeCaptureScreen();
        if (!img) return;
        if (this.matchReference(img)) {
            img.recycle();
            return;
        }
        if (this.isWarehouseFull(img)) {
            img.recycle();
            handleWarehouseFullUnified(actionLabel + '_wfull', false);
            return;
        }
        img.recycle();
        if (!isDriftCheckOn()) {
            pauseScriptOnOffset(actionLabel + "即将开始但画面存在偏移，已自动暂停");
        } else {
            var res = recoverFromFreeze(actionLabel + '前发现偏移', 'drift');
            throw new RecoveredCycleSignal(res.mode, res.menuAlreadyOpen);
        }
    }
};

// ================= 基础轨迹与变速函数 =================
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
    var speedFactor = getLowerSpeedFactor();
    return Math.max(2, Math.round((base * ms / 25) / speedFactor));
}
function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
function matchSteps(fromPt, toPt, nextSteps, nextDist) {
    var d = dist(fromPt, toPt);
    if (nextDist <= 0) return 2;
    return Math.max(2, Math.round(d * nextSteps / nextDist));
}

// ================= 小麦/水稻收割：终点真实停留 + 脱手前截屏判爆仓 =================
// gesture 的时间是按"路径长度"分配的：重复同一个坐标的点路径长度为0，分不到时间，镰刀会直接消失。
// 所以停留靠终点处±10px的来回微移实现，并按整条轨迹的像素/毫秒速度换算需要多少次微移才能停够指定毫秒。
var SICKLE_END_HOLD_MS = 500;
function isHoldHarvestCrop(cropKey) {
    return cropKey === 'wheat' || cropKey === 'rice';
}
function pathLength(pts) {
    var len = 0;
    for (var i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    return len;
}
// 在终点追加原地微幅抖动（±10px），返回加上停留后的手势总时长
function appendEndpointHold(pts, sweepDurationMs, holdMs) {
    var sweepLen = Math.max(1, pathLength(pts));
    var pxPerMs = sweepLen / sweepDurationMs;
    var needHoldLen = pxPerMs * holdMs;
    var endPt = pts[pts.length - 1];
    var stepDist = 20;
    var stepCount = Math.max(2, Math.ceil(needHoldLen / stepDist));
    for (var i = 0; i < stepCount; i++) {
        pts.push([endPt[0] + ((i % 2 === 0) ? 10 : -10), endPt[1]]);
    }
    pts.push([endPt[0], endPt[1]]);
    return sweepDurationMs + holdMs;
}
// 执行带终点停留的收割手势：在停留中段截一张图判爆仓（此时重复书帖弹窗还没出来，爆仓窗口是干净的），随后脱手。返回是否检测到爆仓
function gestureWithEndHoldAndSnap(pts, sweepDurationMs, logTag) {
    var totalDuration = appendEndpointHold(pts, sweepDurationMs, SICKLE_END_HOLD_MS);
    var snapDelay = sweepDurationMs + Math.round(SICKLE_END_HOLD_MS * 0.5);
    var overflow = false;
    var snapThread = threads.start(function () {
        try {
            sleep(snapDelay);
            var imgSnap = safeCaptureScreen();
            if (imgSnap) {
                if (DriftGuard.isWarehouseFull(imgSnap)) {
                    overflow = true;
                    log(logTag + ' 终点停留中脱手前截屏检测到爆仓弹窗！');
                }
                imgSnap.recycle();
            }
        } catch (e) {}
    });
    gesture.apply(null, [totalDuration].concat(pts));
    if (snapThread) {
        try { snapThread.join(1000); } catch (e) {}
    }
    return overflow;
}

function dragFarmLoop(key, harvestCropKey) {
    var p = PARAMS[key];
    var speedFactor = getLowerSpeedFactor();
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
    var l2 = l1 + p.shrink, r2x = r1 - p.shrink, t2 = t1 + p.shrink, b2 = b1 - p.shrink;
    var TL2 = [l2, t2], TR2 = [r2x, t2], BR2 = [r2x, b2], BL2 = [l2, b2];
    var TL_FLAT = [l1, t2];
    var l2TopSteps = scaleSteps(BASE_STEPS.l2_top, p.loop2Ms);
    var l2TopDist = dist(TL2, TR2);
    points = points.concat(generateLine(BL, TL_FLAT, scaleSteps(BASE_STEPS.l1_left, p.loop1Ms)));
    points = points.concat(generateLine(TL_FLAT, TL2, matchSteps(TL_FLAT, TL2, l2TopSteps, l2TopDist)));
    points = points.concat(generateLine(TL2, TR2, l2TopSteps));
    points = points.concat(generateLine(TR2, BR2, scaleSteps(BASE_STEPS.l2_right, p.loop2Ms)));
    points = points.concat(generateLine(BR2, BL2, scaleSteps(BASE_STEPS.l2_bottom, p.loop2Ms)));
    var lastCorner = BL2;
    if (CONFIG.LOOP_COUNT >= 3) {
        var l3 = l2 + p.shrink2, r3 = r2x - p.shrink2, t3 = t2 + p.shrink2, b3 = b2 - p.shrink2;
        var TL3 = [l3, t3], TR3 = [r3, t3], BR3 = [r3, b3], BL3 = [l3, b3];
        var TL2_FLAT = [l2, t3];
        var l3TopSteps = scaleSteps(BASE_STEPS.l3_top, p.loop3Ms);
        var l3TopDist = dist(TL3, TR3);
        points = points.concat(generateLine(BL2, TL2_FLAT, scaleSteps(BASE_STEPS.l3_close, p.loop2Ms)));
        points = points.concat(generateLine(TL2_FLAT, TL3, matchSteps(TL2_FLAT, TL3, l3TopSteps, l3TopDist)));
        points = points.concat(generateLine(TL3, TR3, l3TopSteps));
        points = points.concat(generateLine(TR3, BR3, scaleSteps(BASE_STEPS.l3_right, p.loop3Ms)));
        points = points.concat(generateLine(BR3, BL3, scaleSteps(BASE_STEPS.l3_bottom, p.loop3Ms)));
        lastCorner = BL3;
    }
    var hookSteps = Math.max(15, Math.round(15 / speedFactor));
    points = points.concat(generateLine(lastCorner, p.hook1, hookSteps));
    points = points.concat(generateLine(p.hook1, p.hook2, hookSteps));
    points = points.concat(generateLine(p.hook2, CONFIG.CENTER_TILE, hookSteps));
    if (key === 'sickle' && isHoldHarvestCrop(harvestCropKey)) {
        // 仅小麦/水稻：收割到终点后真实停留约0.5秒再脱手，脱手前截屏检测爆仓弹窗（避免脱手瞬间被重复书帖弹窗盖住）
        var mainSweepMs = Math.max(points.length * 25, 500);
        var preReleaseOverflow = gestureWithEndHoldAndSnap(points, mainSweepMs, '[主田收割]');
        centerTouched = true;
        return preReleaseOverflow;
    }
    var duration = Math.max(points.length * 25, 500);
    gesture.apply(null, [duration].concat(points));
    centerTouched = true;
    return false;
}

// ================= 上方田地轨迹与种收函数 =================
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
    var effSpeed = getUpperEffectiveSpeed();
    var stepPx = CORN_SWEEP.ORIG_PX_PER_PT * effSpeed;
    pts = pts.concat(cornSampleWaypoints(cornBuildWaypoints(CORN_SWEEP.rows), stepPx));
    return pts;
}

function clickUpperCleanSpotForCrop(cropKey, stageLabel) {
    var ck = cropKey || currentCrop;
    if (ck === 'wheat' || ck === 'rice') {
        log('[上方弹窗消除] ' + stageLabel + ' 结束，连点上方SafeClose 2.5 秒');
        var endAt = Date.now() + 2500;
        while (Date.now() < endAt) {
            click(CORN_FIELD.CLEAN_SPOT[0], CORN_FIELD.CLEAN_SPOT[1]);
            pausableSleep(200);
        }
        pausableSleep(200);
    } else {
        click(CORN_FIELD.CLEAN_SPOT[0], CORN_FIELD.CLEAN_SPOT[1]);
        pausableSleep(500);
    }
}

function returnFromUpperFieldToCenter() {
    // 点返回前先对返回键周围取样：点完后对比，判断第一下到底有没有离开上方田地。
    // 已回到主田视角时 (1405,1054) 落在底部工具栏上，再点会误触，所以只有"没离开"才补点（最多补点2次以消除重复书帖弹窗）
    var backRegion = [UPPER_FIELD.BACK_BTN[0] - 60, UPPER_FIELD.BACK_BTN[1] - 54, 120, 66];
    var preImg = safeCaptureScreen();
    var preSamples = preImg ? sampleRegionColors(preImg, backRegion, 20, 10) : null;
    if (preImg) preImg.recycle();

    click(UPPER_FIELD.BACK_BTN[0], UPPER_FIELD.BACK_BTN[1]);
    pausableSleep(UPPER_FIELD.BACK_WAIT_MS);
    for (var retry = 0; retry < 2; retry++) {
        var imgUpperBack = safeCaptureScreen();
        if (!imgUpperBack) break;
        var isCentered = DriftGuard.matchReference(imgUpperBack);
        var stillUpper = true;
        if (preSamples) {
            var nowSamples = sampleRegionColors(imgUpperBack, backRegion, 20, 10);
            var changed = 0;
            var n = Math.min(nowSamples.length, preSamples.length);
            for (var i = 0; i < n; i++) {
                var c1 = preSamples[i], c2 = nowSamples[i];
                var d = Math.max(
                    Math.abs(colors.red(c1) - colors.red(c2)),
                    Math.abs(colors.green(c1) - colors.green(c2)),
                    Math.abs(colors.blue(c1) - colors.blue(c2))
                );
                if (d > 40) changed++;
            }
            stillUpper = changed < n * 0.3;
        }
        imgUpperBack.recycle();
        if (isCentered) break;
        if (stillUpper) {
            log('[上方田地] 点击回中后检测到仍未回中，继续补点第' + (retry + 1) + '次回中坐标');
            click(UPPER_FIELD.BACK_BTN[0], UPPER_FIELD.BACK_BTN[1]);
            pausableSleep(UPPER_FIELD.BACK_WAIT_MS);
        } else {
            log('[上方田地] 已离开上方田地但画面未对上基准图，不再点返回键，交给后续偏移检测处理');
            break;
        }
    }
    clickSafeClose();
    pausableSleep(500);
}

function upperFieldSweep(kind, cropKey) {
    var isPlant = (kind === 'plant');
    var cKey = cropKey || currentCrop;
    var cObj = CROPS[cKey];
    var dispName = getCropDisplayName(cKey);
    toastLog(isPlant ? ("== 播种上方" + dispName + " ==") : ("== 收割上方" + dispName + " =="));
    click(CORN_FIELD.CLEAN_SPOT[0], CORN_FIELD.CLEAN_SPOT[1]);
    pausableSleep(400);
    click(CORN_FIELD.CENTER[0], CORN_FIELD.CENTER[1]);
    pausableSleep(CORN_SWEEP.menuWaitMs);
    if (!isPlant) {
        for (var waitTry = 0; waitTry < 3; waitTry++) {
            var imgSpd = safeCaptureScreen();
            var spdShowing = imgSpd ? isCropSpeedupPopupShowing(imgSpd) : false;
            if (imgSpd) imgSpd.recycle();
            if (!spdShowing) break;
            log("[上方田地] 检测到上方" + dispName + "弹出加速窗口（尚差几秒成熟），关闭弹窗再等10秒后重试收割");
            click(CORN_FIELD.CLEAN_SPOT[0], CORN_FIELD.CLEAN_SPOT[1]);
            pausableSleep(10000);
            click(CORN_FIELD.CENTER[0], CORN_FIELD.CENTER[1]);
            pausableSleep(CORN_SWEEP.menuWaitMs);
        }
    }
    var icon = isPlant ? cObj.seedIcon : CONFIG.sickleIcon;
    var pts = cornBuildGesturePoints(icon);
    var preReleaseOverflow = false;
    if (!isPlant) {
        var upperSweepMs = Math.max(pts.length * CORN_SWEEP.POINT_MS, 500);
        if (isHoldHarvestCrop(cKey)) {
            // 仅小麦/水稻：终点真实停留约0.5秒，脱手前截屏检测爆仓（防止脱手瞬间弹出重复书帖遮挡爆仓窗口）
            preReleaseOverflow = gestureWithEndHoldAndSnap(pts, upperSweepMs, '[上方田地收割]');
        } else {
            gesture.apply(null, [upperSweepMs].concat(pts));
        }
    } else {
        var duration = Math.max(pts.length * CORN_SWEEP.POINT_MS, 500);
        gesture.apply(null, [duration].concat(pts));
        // 必须在整片上方田地全部拖种完毕后再启动计时
        recordUpperFieldPlanted(cKey);
    }
    pausableSleep(500);

    if (!isPlant) {
        var isFull = preReleaseOverflow;
        if (!isFull) {
            var imgCheck = safeCaptureScreen();
            if (imgCheck) {
                isFull = DriftGuard.isWarehouseFull(imgCheck);
                imgCheck.recycle();
            }
        }
        if (isFull) {
            if (cKey === 'wheat' || cKey === 'rice') {
                // 小麦/水稻：先连点上方SafeClose [770, 510] 2.5秒消除可能先浮上来的书帖弹窗（无书帖时该坐标落在爆仓弹窗内，点中无任何影响），再点一次回中坐标 [1405, 1054] 消掉最下面的爆仓弹窗
                log('[上方田地] 小麦/水稻收割爆仓：先连点上方SafeClose [770,510] 2.5秒消书帖弹窗，再点回中坐标 [1405,1054] 消爆仓弹窗');
                clickUpperCleanSpotForCrop(cKey, '上方收割爆仓先消书帖弹窗');
                click(UPPER_FIELD.BACK_BTN[0], UPPER_FIELD.BACK_BTN[1]);
                pausableSleep(500);
            } else {
                // 其他作物无书帖弹窗：直接点一次回中坐标 [1405, 1054] 消除爆仓弹窗
                log('[上方田地] 收割爆仓：点一次回中坐标 [1405,1054] 消爆仓弹窗');
                click(UPPER_FIELD.BACK_BTN[0], UPPER_FIELD.BACK_BTN[1]);
                pausableSleep(500);
            }
            return 'warehouseFull';
        }
    }

    if (!isPlant && (cKey === 'wheat' || cKey === 'rice')) {
        clickUpperCleanSpotForCrop(cKey, '上方收割' + dispName);
    } else {
        click(CORN_FIELD.CLEAN_SPOT[0], CORN_FIELD.CLEAN_SPOT[1]);
        pausableSleep(500);
    }
    return 'ok';
}

function runUpperFieldFlow(plantCropKey, harvestOnly) {
    var targetCropKey = plantCropKey || currentCrop;
    var hadCrop = upperLastPlantTime > 0 && upperPlantedCrop !== null;
    var harvestOverflowed = false;
    click(UPPER_FIELD.ENTER_BTN[0], UPPER_FIELD.ENTER_BTN[1]);
    pausableSleep(UPPER_FIELD.ENTER_WAIT_MS);
    if (hadCrop && UPPER_FIELD.HARVEST_FIRST) {
        if (Date.now() < upperFieldReadyAt) {
            var waitMs = upperFieldReadyAt - Date.now();
            log('[上方田地] 距上方' + getCropDisplayName(upperPlantedCrop) + '成熟还差约 ' + Math.ceil(waitMs / 1000) + ' 秒，先点上方SafeClose再原地等待成熟');
            click(CORN_FIELD.CLEAN_SPOT[0], CORN_FIELD.CLEAN_SPOT[1]);
            pausableSleep(waitMs);
            click(CORN_FIELD.CLEAN_SPOT[0], CORN_FIELD.CLEAN_SPOT[1]);
            pausableSleep(400);
        }
        var harvRes = upperFieldSweep('harvest', upperPlantedCrop);
        if (harvRes === 'warehouseFull') {
            harvestOverflowed = true;
        }
        upperLastPlantTime = 0;
        upperPlantedCrop = null;
        upperFieldReadyAt = 0;
    }
    if (!harvestOnly) {
        upperFieldSweep('plant', targetCropKey);
    }
    returnFromUpperFieldToCenter();
    if (harvestOverflowed) {
        toastLog('[上方田地爆仓] 已在上方补种' + getCropDisplayName(targetCropKey) + '并回中，去仓库按爆仓流程变卖');
        executeOverflowWarehouseSell('上方田地收割爆仓');
        roundWarehouseAlreadySold = true;
    }
}

// ================= 气泡检测与鸡舍/马厩（附加屏幕未偏移判断，防拖屏误触气泡） =================
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

function checkBubbleClickWarehouseFull(sourceLabel) {
    var img = safeCaptureScreen();
    if (!img) return;
    var isFull = DriftGuard.isWarehouseFull(img);
    img.recycle();
    if (isFull) {
        bubbleFlowActive = false;
        log('[' + sourceLabel + '] 点气泡后检测到爆仓弹窗！');
        handleWarehouseFullUnified(sourceLabel + '_bubble', false);
    }
}

function isRiceRoundNow() {
    return (mainPlantedCrop === 'rice' || currentCrop === 'rice');
}

// 气泡点击后若检测到画面偏移：先点SafeClose，再执行三步断线重连回中直到对上中心画面，不碰中心地块菜单
function recenterCenterOnlyAfterBubbleDrift(reasonLabel) {
    log('[气泡防偏] ' + reasonLabel + '：检测到点气泡后画面偏移，先双指内缩解卡+点SafeClose再三步回中');
    pinchInScreen(350);
    sleepWithHeartbeat(500);
    clickSafeClose();
    sleepWithHeartbeat(500);
    var attempt = 0;
    var prevAttemptPatch = null;
    var needRandomDrag = false;
    try {
        while (true) {
            attempt++;
            renewLock();
            if (attempt > 1) {
                var imgDisc = safeCaptureScreen();
                if (imgDisc) {
                    if (isDisconnectDialogShowing(imgDisc)) {
                        imgDisc.recycle();
                        click(CONFIG.disconnectDialogReconnectBtn[0], CONFIG.disconnectDialogReconnectBtn[1]);
                        sleepWithHeartbeat(10000);
                    } else {
                        imgDisc.recycle();
                    }
                }
                if (needRandomDrag) {
                    log('[气泡防偏] 上一轮画面与前一张重合（疑似卡死或死循环），触发双指内缩 pinchInScreen(350) + randomDragScreen(300)');
                    pinchInScreen(350);
                    sleepWithHeartbeat(500);
                    randomDragScreen(300);
                    sleepWithHeartbeat(600);
                    needRandomDrag = false;
                }
                clickSafeClose();
                sleepWithHeartbeat(800);
            }

            click(CONFIG.exitGameBtn[0], CONFIG.exitGameBtn[1]);
            sleepWithHeartbeat(8000);

            click(CONFIG.lobbyEnterFarmBtn[0], CONFIG.lobbyEnterFarmBtn[1]);
            sleepWithHeartbeat(8000);

            while (handleStationScreenIfPresent()) {
                click(CONFIG.exitGameBtn[0], CONFIG.exitGameBtn[1]);
                sleepWithHeartbeat(8000);
                click(CONFIG.lobbyEnterFarmBtn[0], CONFIG.lobbyEnterFarmBtn[1]);
                sleepWithHeartbeat(8000);
            }

            click(CONFIG.noticeBoardRecenterBtn[0], CONFIG.noticeBoardRecenterBtn[1]);
            sleepWithHeartbeat(4500);
            clickSafeClose();
            sleepWithHeartbeat(500);

            var imgCheck = safeCaptureScreen();
            if (imgCheck) {
                var matched = DriftGuard.matchReference(imgCheck);
                if (matched) {
                    var offOk = getReferenceOffset(imgCheck);
                    imgCheck.recycle();
                    log('[气泡防偏] 第' + attempt + '次三步回中成功' + (offOk ? '（偏移 ' + offOk[0] + ',' + offOk[1] + '）' : ''));
                    DriftGuard.reset();
                    break;
                }
                if (prevAttemptPatch) {
                    if (isSameAsPrevAttempt(imgCheck, prevAttemptPatch)) {
                        needRandomDrag = true;
                        log('[气泡防偏] 第' + attempt + '次未对上基准图，且与上一张重合，下一轮触发随机拖屏');
                    } else {
                        needRandomDrag = false;
                        log('[气泡防偏] 第' + attempt + '次未对上基准图，但与上一张不同（画面仍在动），继续回中不拖屏');
                    }
                    prevAttemptPatch.recycle();
                    prevAttemptPatch = null;
                }
                prevAttemptPatch = clipAttemptPatch(imgCheck);
                imgCheck.recycle();
            }
        }
    } finally {
        if (prevAttemptPatch) {
            prevAttemptPatch.recycle();
            prevAttemptPatch = null;
        }
    }
}

// 返回 true=画面位置够准，可以接着点建筑菜单；false=位置仍有偏差，放弃本次喂养（防止误点旋转/移动建筑）
function checkCenterAfterBubbleClicks(sourceLabel) {
    var img = safeCaptureScreen();
    if (!img) return true;
    if (DriftGuard.isWarehouseFull(img)) {
        img.recycle();
        bubbleFlowActive = false;
        log('[' + sourceLabel + '] 点气泡后检测到爆仓弹窗！');
        handleWarehouseFullUnified(sourceLabel + '_bubble', false);
        return true;
    }
    var centered = DriftGuard.matchReference(img);
    var off = centered ? getReferenceOffset(img) : null;
    img.recycle();
    if (centered && !isOffsetTooBig(off)) return true;

    // 第一下不对：先点SafeClose（点气泡可能弹出了遮住基准区的窗口），等一会儿复核，别直接断线重连
    log('[气泡防偏] ' + sourceLabel + '点气泡后未对上基准图' + (off ? '（偏移 ' + off[0] + ',' + off[1] + '）' : '') + '，先点SafeClose复核一次');
    clickSafeClose();
    pausableSleep(700);
    var img2 = safeCaptureScreen();
    if (img2) {
        var centered2 = DriftGuard.matchReference(img2);
        var off2 = centered2 ? getReferenceOffset(img2) : null;
        if (centered2 && !isOffsetTooBig(off2)) {
            img2.recycle();
            log('[气泡防偏] SafeClose后已对上基准图，不需要断线回中');
            return true;
        }
        if (!centered2) diagnoseReferenceMiss('bubble_check_miss', img2);
        img2.recycle();
    }
    if (!isDriftCheckOn()) {
        pauseScriptOnOffset(sourceLabel + "点气泡后画面偏移，已自动暂停");
    }
    recenterCenterOnlyAfterBubbleDrift(sourceLabel + '点气泡偏移');
    // 回中"对上"只代表偏差在40px内；接着要点的建筑弹窗按钮很密，偏太多就不点了
    var img3 = safeCaptureScreen();
    if (img3) {
        var off3 = getReferenceOffset(img3);
        img3.recycle();
        if (isOffsetTooBig(off3)) {
            log('[气泡防偏] ' + sourceLabel + '回中后仍偏移 ' + off3[0] + ',' + off3[1] + ' px（上限' + BUBBLE_MAX_OFFSET_PX + '），放弃本次建筑操作');
            return false;
        }
    }
    return true;
}

function checkAndRunFarmTasks() {
    if (!isChickenEnabled() || bubbleFlowActive) return 'none';
    var img = safeCaptureScreen();
    if (!img) return 'none';
    // 【附加判断】：检测到气泡的同时必须画面未发生偏移，避免不暂停拖屏时误触点击气泡（两挡通用）
    if (!DriftGuard.matchReference(img)) {
        img.recycle();
        return 'none';
    }
    var has_CT = isBubblePresent(img, CONFIG.bubble_CT[0], CONFIG.bubble_CT[1]);
    var has_CR = isBubblePresent(img, CONFIG.bubble_CR[0], CONFIG.bubble_CR[1]);
    img.recycle();

    // 初测 CR=true 时，等5秒再复测一次，排除田间随机小白人浇水动画等瞬间白色干扰，同时让稍慢半拍的左鸡舍气泡对齐
    if (has_CR) {
        log("鸡舍气泡初测: CT=" + has_CT + " CR=true，等待5秒二次复核...");
        pausableSleep(5000);
        var imgRe = safeCaptureScreen();
        if (!imgRe) return 'none';
        if (!DriftGuard.matchReference(imgRe)) {
            imgRe.recycle();
            return 'none';
        }
        var has_CT_re = isBubblePresent(imgRe, CONFIG.bubble_CT[0], CONFIG.bubble_CT[1]);
        has_CR = isBubblePresent(imgRe, CONFIG.bubble_CR[0], CONFIG.bubble_CR[1]);
        has_CT = has_CT && has_CT_re;
        imgRe.recycle();
        log("鸡舍气泡5秒复核: CT=" + has_CT + "(复测=" + has_CT_re + ") CR=" + has_CR);
        if (!has_CR) {
            log("[鸡舍气泡] 5秒复核CR为false，判定为小人浇水等瞬间动画干扰，忽略本次触发");
            return 'none';
        }
        DriftGuard.onBubblesFound();
        chickenRightNoBubbleSince = 0;
    } else {
        if (has_CT) {
            log("鸡舍气泡: CT=true CR=false");
            DriftGuard.onBubblesFound();
        }
        if (chickenRightNoBubbleSince === 0) {
            chickenRightNoBubbleSince = Date.now();
        }
    }

    var isAutoMode = ((nextDriveMode || currentDriveMode) === 'auto');
    var rightNoBubbleDur = chickenRightNoBubbleSince > 0 ? (Date.now() - chickenRightNoBubbleSince) : 0;
    var timeoutDue = isAutoMode && (rightNoBubbleDur >= CHICKEN_TIMEOUT_MS) && !isRiceRoundNow();

    var mode = 'none';
    if (has_CR) {
        mode = has_CT ? 'cr_and_ct' : 'cr_only';
        toastLog("鸡舍气泡成熟，开始走流程");
    } else if (timeoutDue) {
        mode = 'timeout_rescue';
        log("[鸡舍超时保底] 自动挡CR超25分钟未亮且非水稻轮，执行收料补产");
    }
    if (mode === 'none') return 'none';
    return runChickenFlow(mode);
}

function runChickenFlow(mode) {
    beginAction();
    bubbleFlowActive = true;
    if (mode === 'timeout_rescue') {
        // 超时保底：只点上方两个铡刀坊气泡收料，随后直接去鸡舍喂饲料
        click(CONFIG.bubble_CB[0], CONFIG.bubble_CB[1]); pausableSleep(400);
        click(CONFIG.bubble_CT[0], CONFIG.bubble_CT[1]); pausableSleep(400);
    } else if (mode === 'cr_only') {
        // bubble_CR=true 但 bubble_CT=false：只点左右两边鸡舍气泡，上下两个铡刀坊不盲点，随后正常走流程上料
        click(CONFIG.bubble_CR[0], CONFIG.bubble_CR[1]); pausableSleep(400);
        click(CONFIG.bubble_CL[0], CONFIG.bubble_CL[1]); pausableSleep(400);
    } else {
        // bubble_CR=true 且 bubble_CT=true：依次点 CR -> CL -> CT -> CB
        click(CONFIG.bubble_CR[0], CONFIG.bubble_CR[1]); pausableSleep(400);
        click(CONFIG.bubble_CL[0], CONFIG.bubble_CL[1]); pausableSleep(400);
        click(CONFIG.bubble_CT[0], CONFIG.bubble_CT[1]); pausableSleep(400);
        click(CONFIG.bubble_CB[0], CONFIG.bubble_CB[1]); pausableSleep(400);
    }
    pausableSleep(1500);
    if (!checkCenterAfterBubbleClicks('鸡舍')) {
        bubbleFlowActive = false;
        chickenRightNoBubbleSince = Date.now();
        toastLog('[鸡舍] 回中后位置仍有偏差，本次不点建筑菜单，放弃喂养');
        return 'aborted';
    }

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
    click(CONFIG.enter_CL[0], CONFIG.enter_CL[1]); pausableSleep(1800);
    gesture(1600, CONFIG.coopFeedIcon, CONFIG.coopFeedIcon, CONFIG.coopChicken1, [1230, 540], CONFIG.coopChicken6);
    pausableSleep(200);
    click(CONFIG.coopPopupSafeClick[0], CONFIG.coopPopupSafeClick[1]);
    pausableSleep(400);
    clickSafeClose(); pausableSleep(1000);
    click(CONFIG.build_CR[0], CONFIG.build_CR[1]); pausableSleep(1000);
    click(CONFIG.enter_CR[0], CONFIG.enter_CR[1]); pausableSleep(1800);
    gesture(1600, CONFIG.coopFeedIcon, CONFIG.coopFeedIcon, CONFIG.coopChicken1, [1230, 540], CONFIG.coopChicken6);
    pausableSleep(200);
    click(CONFIG.coopPopupSafeClick[0], CONFIG.coopPopupSafeClick[1]);
    pausableSleep(400);
    clickSafeClose(); pausableSleep(1000);
    click(CONFIG.recenterTileAfterFarm[0], CONFIG.recenterTileAfterFarm[1]);
    centerTouched = true;
    pausableSleep(1000);

    needSellWheat = true;
    chickenRunCount++;
    if (chickenRunCount >= 2) {
        needSellEggs = true;
        chickenRunCount = 0;
        log('[鸡舍] 走满2次鸡舍流程，标记去仓库变卖：良田小麦×1 + 鸡蛋×1');
    } else {
        log('[鸡舍] 走完第1次鸡舍流程（鸡蛋暂存），标记去仓库变卖：良田小麦×1');
    }
    bubbleFlowActive = false;
    chickenLeftNoBubbleSince = Date.now();
    chickenRightNoBubbleSince = Date.now();
    return mode;
}

function checkAndRunRanchTasks() {
    if (!isRanchEnabled() || bubbleFlowActive || pauseRanchAfterRiceOverflow) return 'none';
    var img = safeCaptureScreen();
    if (!img) return 'none';
    // 【附加判断】：检测到气泡的同时必须画面未发生偏移，避免不暂停拖屏时误触点击气泡（两挡通用）
    if (!DriftGuard.matchReference(img)) {
        img.recycle();
        return 'none';
    }
    var has_HL = isBubblePresent(img, CONFIG.bubble_HL[0], CONFIG.bubble_HL[1]);
    img.recycle();

    // 初测 HL=true 时，先等5秒复测一次排除田间随机小白人浇水等瞬间动画干扰；若仍为true再等剩余5秒（合计10秒）待HR亮起并二次确认
    if (has_HL) {
        log("马厩气泡初测: HL=true，等待5秒二次复核...");
        pausableSleep(5000);
        var imgRe = safeCaptureScreen();
        if (!imgRe) return 'none';
        if (!DriftGuard.matchReference(imgRe)) {
            imgRe.recycle();
            return 'none';
        }
        has_HL = isBubblePresent(imgRe, CONFIG.bubble_HL[0], CONFIG.bubble_HL[1]);
        imgRe.recycle();
        log("马厩气泡5秒复核: HL=" + has_HL);
        if (!has_HL) {
            log("[马厩气泡] 5秒复核HL为false，判定为小人浇水等瞬间动画干扰，忽略本次触发");
            return 'none';
        }
        DriftGuard.onBubblesFound();
        ranchLeftNoBubbleSince = 0;
    } else if (ranchLeftNoBubbleSince === 0) {
        ranchLeftNoBubbleSince = Date.now();
    }

    var isAutoMode = ((nextDriveMode || currentDriveMode) === 'auto');
    var leftNoBubbleDur = ranchLeftNoBubbleSince > 0 ? (Date.now() - ranchLeftNoBubbleSince) : 0;
    var timeoutDue = isAutoMode && (leftNoBubbleDur >= RANCH_TIMEOUT_MS) && !isRiceRoundNow();

    var mode = 'none';
    if (has_HL) {
        mode = 'hl_ready';
        log("[马厩气泡] HL二次复核通过，再等5秒（满10秒）待HR弹出后走马厩流程");
    } else if (timeoutDue) {
        mode = 'timeout_rescue';
        log("[马厩超时保底] 自动挡HL超65分钟未亮且非水稻轮，执行收料补产");
    }
    if (mode === 'none') return 'none';
    return runRanchFlow(mode);
}

function runRanchFlow(mode) {
    beginAction();
    bubbleFlowActive = true;
    if (mode === 'timeout_rescue') {
        // 超时保底：只强制点下方铡刀坊收料，随后直接去马厩喂饲料
        click(CONFIG.bubble_HC[0], CONFIG.bubble_HC[1]); pausableSleep(1500);
    } else {
        // HL已在5秒复核通过，再等剩余5秒（总计10秒）确保稍晚弹出的HR亮起，点击前再核对一次中心与HL气泡
        pausableSleep(5000);
        var imgPre = safeCaptureScreen();
        if (imgPre) {
            var stillCentered = DriftGuard.matchReference(imgPre);
            var stillHL = stillCentered && isBubblePresent(imgPre, CONFIG.bubble_HL[0], CONFIG.bubble_HL[1]);
            imgPre.recycle();
            if (!stillCentered || !stillHL) {
                log("[马厩气泡] 满10秒点击前复核未通过（centered=" + stillCentered + ", HL=" + stillHL + "），取消本次马厩触发");
                bubbleFlowActive = false;
                return 'none';
            }
        }
        toastLog("马厩气泡成熟，开始走流程");
        click(CONFIG.bubble_HL[0], CONFIG.bubble_HL[1]); pausableSleep(400);
        click(CONFIG.bubble_HC[0], CONFIG.bubble_HC[1]); pausableSleep(500);
        click(CONFIG.bubble_HR[0], CONFIG.bubble_HR[1]); pausableSleep(1500);
    }
    if (!checkCenterAfterBubbleClicks('马厩')) {
        bubbleFlowActive = false;
        ranchLeftNoBubbleSince = Date.now();
        toastLog('[马厩] 回中后位置仍有偏差，本次不点建筑菜单，放弃喂养');
        return 'aborted';
    }
    pausableSleep(500);
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
    ranchRunCount++;
    if (ranchRunCount >= 2) {
        needSellMilk = true;
        ranchRunCount = 0;
        log('[马厩] 满2次马厩流程，标记出售马奶');
    } else {
        log('[马厩] 当前走完第1次马厩流程，马奶暂存（第2次走完再卖）');
    }
    bubbleFlowActive = false;
    ranchLeftNoBubbleSince = Date.now();
    ranchRightNoBubbleSince = Date.now();
    return mode;
}

// ================= 驿站出货、水域检测与自动装载 =================
function checkStationHasGoods(img) {
    return regionHasColorNear(img, CONFIG.stationGoodsCheckPoint[0], CONFIG.stationGoodsCheckPoint[1], 15, CONFIG.stationGoodsColor, CONFIG.stationGoodsColorTolerance, 5);
}
function isOnStationScreen(img) {
    return regionHasColorNear(img, CONFIG.stationScreenCheckPoint[0], CONFIG.stationScreenCheckPoint[1], 15, CONFIG.stationScreenColor, CONFIG.stationScreenColorTolerance, 5);
}
function handleStationWarehouseFull() {
    toastLog('【驿站收货爆仓】右下角连点3次退出，去仓库清仓');
    for (var i = 0; i < 3; i++) {
        click(CONFIG.SAFE_CLOSE[0], CONFIG.SAFE_CLOSE[1]);
        pausableSleep(500);
    }
    pausableSleep(500);
    var activeMode = nextDriveMode || currentDriveMode;
    if (activeMode === 'manual') {
        if (currentManualGear === 'corn' || currentManualGear === 'pumpkin' || currentManualGear === 'corn_pumpkin' || currentManualGear === 'fertile') {
            pauseOnOverflowDirectly('驿站爆仓');
            return;
        }
        var mItems = [cropSellItem(currentCrop, 3)];
        warehouseTripCount++;
        log('[仓库] 第' + warehouseTripCount + '趟（手动挡驿站爆仓卖' + CROPS[currentCrop].label + '×3）：' + describeSellItems(mItems));
        openWarehouse();
        runSellQueue(mItems);
        closeWarehouseToField();
        return;
    }
    var items = [];
    if (CONFIG.milkSlotInWarehouse && CONFIG.milkSellBtn) items.push(milkSellItem());
    if (CONFIG.eggSlotInWarehouse && CONFIG.eggSellBtn) items.push(eggSellItem());
    items.push(cropSellItem('corn', 1));
    items.push(cropSellItem('cane', 1));
    items.sort(slotOrderCompare);
    warehouseTripCount++;
    log('[仓库] 第' + warehouseTripCount + '趟（自动挡驿站爆仓变卖）：' + describeSellItems(items));
    openWarehouse();
    runSellQueue(items);
    closeWarehouseToField();
    chickenRunCount = 0;
    ranchRunCount = 0;
}
function collectStationGoods() {
    beginAction();
    var loadOn = isStationLoadOn();
    log('[驿站] 开始收货流程（当前挡位=' + ((nextDriveMode || currentDriveMode) === 'auto' ? '自动挡' : '手动挡') + '，自动装载=' + (loadOn ? '开' : '关') + '）');
    click(CONFIG.stationIcon[0], CONFIG.stationIcon[1]);
    sleepWithHeartbeat(3000);
    click(CONFIG.stationHarvestBtn[0], CONFIG.stationHarvestBtn[1]);
    sleepWithHeartbeat(3000);
    var imgCheck = safeCaptureScreen();
    var isFull = false;
    if (imgCheck) {
        isFull = DriftGuard.isWarehouseFull(imgCheck);
        imgCheck.recycle();
    }
    if (isFull) {
        handleStationWarehouseFull();
        click(CONFIG.stationIcon[0], CONFIG.stationIcon[1]);
        sleepWithHeartbeat(3000);
        click(CONFIG.stationHarvestBtn[0], CONFIG.stationHarvestBtn[1]);
        sleepWithHeartbeat(3000);
    }
    if (isStationLoadOn()) {
        click(CONFIG.stationLoadBtn[0], CONFIG.stationLoadBtn[1]);
        sleepWithHeartbeat(3000);
    }
    clickSafeClose();
    sleepWithHeartbeat(500);
    stationGoodsPending = false;
}
function handleStationScreenIfPresent() {
    var img = safeCaptureScreen();
    if (!img) return false;
    var onStation = isOnStationScreen(img);
    img.recycle();
    if (!onStation) return false;
    log('[驿站水域检测] 检测到左上角驿站水域，直接执行完整驿站收货流程');
    collectStationGoods();
    return true;
}

// ================= 盲点断线回中与良田独立偏移回中 =================
function isCropSpeedupPopupShowing(img) {
    var checkRegion = [1050, 400, 300, 80];
    var avgC = regionAvgColor(img, checkRegion);
    var brightness = (avgC[0] + avgC[1] + avgC[2]) / 3;
    if (brightness < 180) return false;
    var targetC = [245, 235, 205];
    var diff = Math.max(Math.abs(avgC[0] - targetC[0]), Math.abs(avgC[1] - targetC[1]), Math.abs(avgC[2] - targetC[2]));
    return diff <= 35;
}
function saveFreezeDebugImg(label) {
    try {
        var img = safeCaptureScreen();
        if (!img) return;
        var ts = new java.text.SimpleDateFormat('yyyyMMdd_HHmmss_SSS').format(new Date());
        images.save(img, DEBUG_DIR + ts + '_freeze_' + label + '.png');
        img.recycle();
    } catch (e) {}
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
// 双指方向相反向内捏合缩放（解除单指拖动无法解开的触控死锁/镜头缩放卡死）
function pinchInScreen(durationMs) {
    var dur = durationMs || 350;
    try {
        gestures(
            [0, dur, [650, 320], [1080, 500]],
            [0, dur, [1760, 760], [1330, 580]]
        );
    } catch (e) {
        log("[双指缩放异常] " + e);
    }
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

function blindExitReenterAndRecenter(reasonLabel) {
    if (!isDriftCheckOn()) {
        pauseScriptOnOffset("检测到画面偏移或异常（" + reasonLabel + "），已自动暂停");
    }
    toastLog('触发盲点回中恢复（' + reasonLabel + '），请勿操作手机');
    saveFreezeDebugImg('recover_start');
    log('[盲点回中] 优先执行一次双指内缩 pinchInScreen(350) 解除潜在触控/镜头卡死');
    pinchInScreen(350);
    sleepWithHeartbeat(500);
    clickSafeClose();
    sleepWithHeartbeat(500);
    handleStationScreenIfPresent();
    var attempt = 0;
    var prevAttemptPatch = null;
    var needRandomDrag = false;
    try {
        while (true) {
            attempt++;
            renewLock();
            if (attempt > 1) {
                var imgDisc = safeCaptureScreen();
                if (imgDisc) {
                    if (isDisconnectDialogShowing(imgDisc)) {
                        imgDisc.recycle();
                        click(CONFIG.disconnectDialogReconnectBtn[0], CONFIG.disconnectDialogReconnectBtn[1]);
                        sleepWithHeartbeat(10000);
                    } else {
                        imgDisc.recycle();
                    }
                }
                if (needRandomDrag) {
                    log('[盲点回中] 上一轮画面与前一张重合（疑似卡死或死循环），触发双指内缩 pinchInScreen(350) + randomDragScreen(300)');
                    pinchInScreen(350);
                    sleepWithHeartbeat(500);
                    randomDragScreen(300);
                    sleepWithHeartbeat(600);
                    needRandomDrag = false;
                }
                clickSafeClose();
                sleepWithHeartbeat(800);
            }

            click(CONFIG.exitGameBtn[0], CONFIG.exitGameBtn[1]);
            sleepWithHeartbeat(8000);

            click(CONFIG.lobbyEnterFarmBtn[0], CONFIG.lobbyEnterFarmBtn[1]);
            sleepWithHeartbeat(8000);

            // 点过屯田坐标后、点下方回中坐标之前：检测左上角水域RGB，若落入驿站视角则先走完整收货流程，再点右上角退出重进屯田
            while (handleStationScreenIfPresent()) {
                log('[驿站水域检测] 驿站收货完成，重新点右上角退出再进屯田以恢复正常布告栏定位');
                click(CONFIG.exitGameBtn[0], CONFIG.exitGameBtn[1]);
                sleepWithHeartbeat(8000);
                click(CONFIG.lobbyEnterFarmBtn[0], CONFIG.lobbyEnterFarmBtn[1]);
                sleepWithHeartbeat(8000);
            }

            click(CONFIG.noticeBoardRecenterBtn[0], CONFIG.noticeBoardRecenterBtn[1]);
            sleepWithHeartbeat(4500);
            clickSafeClose();
            sleepWithHeartbeat(500);

            var imgCheck = safeCaptureScreen();
            if (imgCheck) {
                var matched = DriftGuard.matchReference(imgCheck);
                if (matched) {
                    var offOk = getReferenceOffset(imgCheck);
                    imgCheck.recycle();
                    log('[盲点回中] 第' + attempt + '次尝试成功对上中心画面！' + (offOk ? '（偏移 ' + offOk[0] + ',' + offOk[1] + '）' : ''));
                    DriftGuard.reset();
                    break;
                }
                if (prevAttemptPatch) {
                    if (isSameAsPrevAttempt(imgCheck, prevAttemptPatch)) {
                        needRandomDrag = true;
                        log('[盲点回中] 第' + attempt + '次未对上基准图，且与上一张重合，下一轮触发随机拖屏');
                    } else {
                        needRandomDrag = false;
                        log('[盲点回中] 第' + attempt + '次未对上基准图，但与上一张不同（画面仍在动），继续回中不拖屏');
                    }
                    prevAttemptPatch.recycle();
                    prevAttemptPatch = null;
                }
                prevAttemptPatch = clipAttemptPatch(imgCheck);
                imgCheck.recycle();
            }
        }
    } finally {
        if (prevAttemptPatch) {
            prevAttemptPatch.recycle();
            prevAttemptPatch = null;
        }
    }

    if (!isCropReadyNow()) {
        var remainSec = Math.max(0, Math.round((getCropReadyAt() - Date.now()) / 1000));
        log('[回中恢复] 距离' + getCropDisplayName(mainPlantedCrop || currentCrop) + '成熟还有约 ' + remainSec + ' 秒，点SafeClose后原地等待');
        return { mode: 'wait', menuAlreadyOpen: false };
    }
    var imgBefore = safeCaptureScreen();
    var beforeSamples = imgBefore ? getRegionColorFingerprint(imgBefore) : null;
    if (imgBefore) imgBefore.recycle();

    clickCenterTile(CONFIG.CENTER_TILE[0], CONFIG.CENTER_TILE[1]);
    var elapsed = 0, popped = false, speedupShowing = false;
    while (elapsed < 3000) {
        pausableSleep(200);
        elapsed += 200;
        renewLock();
        var imgNow = safeCaptureScreen();
        if (imgNow) {
            if (isCropSpeedupPopupShowing(imgNow)) {
                speedupShowing = true;
                imgNow.recycle();
                break;
            }
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
    if (speedupShowing) {
        clickSafeClose();
        sleepWithHeartbeat(500);
        extendWaitTimerForUnripeCrop(20);
        return { mode: 'wait', menuAlreadyOpen: false };
    }
    if (!popped) {
        clickSafeClose();
        sleepWithHeartbeat(500);
        return { mode: 'harvest', menuAlreadyOpen: false };
    }
    sleep(350);
    return { mode: 'harvest', menuAlreadyOpen: true };
}

function recoverFromFreeze(reasonLabel, kind) {
    return blindExitReenterAndRecenter(reasonLabel);
}

// 纯良田挂机专属断线回良田恢复（退出 → 屯田 → 回中 → 进良田 → 定住镜头 → 2秒后核对左鸡舍屋顶参考图）
// 回来后只定住镜头，绝不点种/拖拽：此时小麦多半还没熟，空拖会拖屏；收种统一交给主步骤等读秒到点再做
function recoverPureFertileFromDrift() {
    toastLog("检测到良田画面偏移，触发四步重返良田恢复...");
    pinchInScreen(350);
    sleepWithHeartbeat(500);
    clickSafeClose();
    sleepWithHeartbeat(500);
    var attempt = 0;
    var prevAttemptPatch = null;
    var needRandomDrag = false;
    try {
        while (true) {
            attempt++;
            renewLock();
            if (attempt > 1) {
                if (needRandomDrag) {
                    log('[良田回中] 上一轮画面与前一张重合，触发双指内缩 pinchInScreen(350) + randomDragScreen(300)');
                    pinchInScreen(350);
                    sleepWithHeartbeat(500);
                    randomDragScreen(300);
                    sleepWithHeartbeat(600);
                    needRandomDrag = false;
                }
                clickSafeClose();
                sleepWithHeartbeat(800);
            }
            // 1. 点右上角退出
            click(CONFIG.exitGameBtn[0], CONFIG.exitGameBtn[1]);
            sleepWithHeartbeat(8000);
            // 2. 盲点主页屯田入口
            click(CONFIG.lobbyEnterFarmBtn[0], CONFIG.lobbyEnterFarmBtn[1]);
            sleepWithHeartbeat(8000);
            // 2.5 点过屯田坐标后、点回中坐标之前：检测左上角水域RGB，若落入驿站视角则先收货再退出重进屯田
            while (handleStationScreenIfPresent()) {
                click(CONFIG.exitGameBtn[0], CONFIG.exitGameBtn[1]);
                sleepWithHeartbeat(8000);
                click(CONFIG.lobbyEnterFarmBtn[0], CONFIG.lobbyEnterFarmBtn[1]);
                sleepWithHeartbeat(8000);
            }
            // 3. 点告示牌回中
            click(CONFIG.noticeBoardRecenterBtn[0], CONFIG.noticeBoardRecenterBtn[1]);
            sleepWithHeartbeat(4500);
            clickSafeClose();
            sleepWithHeartbeat(500);
            // 4. 点左侧进良田按钮
            click(FERTILE.ENTER_BTN[0], FERTILE.ENTER_BTN[1]);
            sleepWithHeartbeat(1000);
            // 5. 读秒未走完（小麦在长）才点一下中心定住镜头，与正常种完后的锁镜头动作一致
            if (fertileFieldReadyAt > Date.now()) {
                clickFertileSafeClose();
                sleep(FERTILE.STEP_GAP_MS);
                click(CONFIG.CENTER_TILE[0], CONFIG.CENTER_TILE[1]);
            }

            // 过2秒检测是否成功返回良田并对上良田参考图
            pausableSleep(2000);
            var imgCheck = safeCaptureScreen();
            if (imgCheck) {
                var ok = matchFertileReference(imgCheck);
                if (ok) {
                    imgCheck.recycle();
                    toastLog("已成功重返良田！");
                    break;
                }
                if (prevAttemptPatch) {
                    if (isSameAsPrevAttempt(imgCheck, prevAttemptPatch)) {
                        needRandomDrag = true;
                    } else {
                        needRandomDrag = false;
                    }
                    prevAttemptPatch.recycle();
                    prevAttemptPatch = null;
                }
                prevAttemptPatch = clipAttemptPatch(imgCheck);
                imgCheck.recycle();
            }
        }
    } finally {
        if (prevAttemptPatch) {
            prevAttemptPatch.recycle();
            prevAttemptPatch = null;
        }
    }
}

// ================= 菜单弹出检测 =================
var menuRefColors = null;
function getRegionColorFingerprint(img) {
    return sampleRegionColors(img, CONFIG.sickleMenuRegion, 40, 10);
}
function hasMenuPopped(img) {
    if (!menuRefColors || !img) return false;
    if (isCropSpeedupPopupShowing(img)) return false;
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
        var elapsed = 0, popped = false, speedupShowing = false;
        while (elapsed < 3000) {
            pausableSleep(200);
            elapsed += 200;
            renewLock();
            var imgNow = safeCaptureScreen();
            if (imgNow) {
                if (isCropSpeedupPopupShowing(imgNow)) {
                    speedupShowing = true;
                    imgNow.recycle();
                    break;
                }
                if (hasMenuPopped(imgNow)) {
                    imgNow.recycle();
                    popped = true;
                    break;
                }
                imgNow.recycle();
            }
        }
        if (speedupShowing) {
            toastLog('检测到' + getCropDisplayName(mainPlantedCrop || currentCrop) + '读秒未到（弹出加速），点SafeClose后原地等待');
            clickSafeClose();
            pausableSleep(500);
            extendWaitTimerForUnripeCrop(20);
            throw new RecoveredCycleSignal('wait', false);
        }
        if (popped) {
            sleep(350);
            return true;
        }
    }
    var result = recoverFromFreeze(stepLabel + '-菜单未弹出', 'freeze');
    throw new RecoveredCycleSignal(result.mode, result.menuAlreadyOpen);
}

// ================= 仓库与分模式爆仓处理 =================
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
function fertileWheatSellItem(times) {
    var c = CROPS.wheat;
    return { label: '良田小麦', slot: c.slot, btn: c.sellBtn, times: times, cropKey: null, tag: 'wheat' };
}
function eggSellItem() {
    return { label: '鸡蛋', slot: CONFIG.eggSlotInWarehouse, btn: CONFIG.eggSellBtn, times: 1, cropKey: null, tag: 'egg' };
}
function milkSellItem() {
    return { label: '马奶', slot: CONFIG.milkSlotInWarehouse, btn: CONFIG.milkSellBtn, times: 1, cropKey: null, tag: 'milk' };
}
function describeSellItems(items) {
    var parts = [];
    for (var i = 0; i < items.length; i++) parts.push(items[i].label + '×' + items[i].times);
    return parts.join(' → ');
}
function runSellQueue(items) {
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it.slot || !it.btn) continue;
        for (var t = 0; t < it.times; t++) {
            click(it.slot[0], it.slot[1]);
            pausableSleep(500);
            click(it.btn[0], it.btn[1]);
            pausableSleep(500);
        }
        if (it.tag === 'wheat') needSellWheat = false;
        if (it.tag === 'egg') needSellEggs = false;
        if (it.tag === 'milk') needSellMilk = false;
    }
}

function pauseOnOverflowDirectly(reasonLabel) {
    toastLog('检测到爆仓弹窗，已点掉弹窗并暂停');
    click(CONFIG.warehouseFullCloseBtn[0], CONFIG.warehouseFullCloseBtn[1]);
    sleep(500);
    clickSafeClose();
    sleep(300);
    plantDone = false;
    skipToHarvestOnce = false;
    skipWaitOnce = false;
    pendingMenuAlreadyOpen = false;
    CTRL.paused = true;
    pauseTriggered = true;
    syncUI();
    throw new PauseSignal();
}

// 统一执行仓库爆仓变卖动作（不抛异常、不重置主田轮次，供主田收割爆仓/上方田地爆仓/常规轮良田爆仓共用）
function executeOverflowWarehouseSell(reasonLabel) {
    var sellRefCrop = savedCropBeforeRescue || currentCrop;
    if (currentDriveMode === 'manual') {
        if (currentManualGear === 'corn' || currentManualGear === 'pumpkin' || currentManualGear === 'corn_pumpkin' || currentManualGear === 'fertile' || !CROPS[sellRefCrop] || !CROPS[sellRefCrop].slot) {
            pauseOnOverflowDirectly(reasonLabel);
            return;
        }
        var mItems = [cropSellItem(sellRefCrop, 3)];
        if (extraOverflowWheatSells > 0) {
            if (sellRefCrop === 'wheat') {
                mItems[0].times += extraOverflowWheatSells;
            } else {
                mItems.push(cropSellItem('wheat', extraOverflowWheatSells));
            }
            extraOverflowWheatSells = 0;
        }
        if (isChickenEnabled()) {
            if (needSellWheat && sellRefCrop !== 'wheat') {
                mItems.push(fertileWheatSellItem(1));
                lastNoChickenWheatSellTime = Date.now();
            } else if (needSellWheat) {
                needSellWheat = false;
            }
        } else {
            if (sellRefCrop !== 'wheat') {
                mItems.push(fertileWheatSellItem(CONFIG.FERTILE_NO_CHICKEN_WHEAT_SELLS));
            }
            lastNoChickenWheatSellTime = Date.now();
        }
        if (needSellEggs && CONFIG.eggSlotInWarehouse && CONFIG.eggSellBtn) mItems.push(eggSellItem());
        if (needSellMilk && CONFIG.milkSlotInWarehouse && CONFIG.milkSellBtn) mItems.push(milkSellItem());
        mItems.sort(slotOrderCompare);
        warehouseTripCount++;
        toastLog('[手动挡爆仓清仓]（' + reasonLabel + '）：' + describeSellItems(mItems));
        openWarehouse();
        runSellQueue(mItems);
        closeWarehouseToField();
        return;
    }

    var items = [];
    if (CONFIG.milkSlotInWarehouse && CONFIG.milkSellBtn) items.push(milkSellItem());
    if (CONFIG.eggSlotInWarehouse && CONFIG.eggSellBtn) items.push(eggSellItem());
    items.push(cropSellItem('corn', 1));
    items.push(cropSellItem('cane', 2));
    if (sellRefCrop === 'soy' || sellRefCrop === 'rice' || autoPendingSellCrop === 'soy' || autoPendingSellCrop === 'rice') {
        items.push(cropSellItem('soy', 2));
    }
    if (sellRefCrop === 'rice' || autoPendingSellCrop === 'rice') {
        items.push(cropSellItem('rice', 1));
    }
    var extraWheat = extraOverflowWheatSells;
    extraOverflowWheatSells = 0;
    if (!isChickenEnabled()) {
        extraWheat += CONFIG.FERTILE_NO_CHICKEN_WHEAT_SELLS;
        lastNoChickenWheatSellTime = Date.now();
    }
    if (extraWheat > 0) {
        items.push(fertileWheatSellItem(extraWheat));
    }
    items.sort(slotOrderCompare);
    warehouseTripCount++;
    toastLog('[自动挡爆仓清仓]（' + reasonLabel + '）：' + describeSellItems(items));
    openWarehouse();
    runSellQueue(items);
    closeWarehouseToField();

    autoPendingSellCrop = null;
    autoPendingSellTimes = 0;
    needSellWheat = false;
    needSellEggs = false;
    needSellMilk = false;
    chickenRunCount = 0;
    ranchRunCount = 0;
    if (sellRefCrop === 'rice') {
        pauseRanchAfterRiceOverflow = true;
    }
}

function handleWarehouseFullUnified(reasonLabel, isOnUpperField) {
    click(CONFIG.warehouseFullCloseBtn[0], CONFIG.warehouseFullCloseBtn[1]);
    pausableSleep(800);
    if (isOnUpperField) {
        returnFromUpperFieldToCenter();
    }
    executeOverflowWarehouseSell(reasonLabel);
    roundWarehouseAlreadySold = true;
}

function isNoChickenWheatSellDue() {
    return !isChickenEnabled() &&
           fertileLastPlantTime > 0 &&
           (Date.now() - lastNoChickenWheatSellTime >= CONFIG.FERTILE_NO_CHICKEN_SELL_SEC * 1000);
}

function runRoundWarehouseSells(cropKeyToSell, sellTimes, reasonText) {
    var items = [];
    if (cropKeyToSell && sellTimes > 0 && CROPS[cropKeyToSell] && CROPS[cropKeyToSell].slot) {
        items.push(cropSellItem(cropKeyToSell, sellTimes));
    }
    if (extraOverflowWheatSells > 0) {
        if (cropKeyToSell === 'wheat' && items.length > 0) {
            items[0].times += extraOverflowWheatSells;
        } else {
            items.push(cropSellItem('wheat', extraOverflowWheatSells));
        }
        extraOverflowWheatSells = 0;
    }
    if (isChickenEnabled()) {
        if (needSellWheat) {
            if (cropKeyToSell !== 'wheat') {
                items.push(fertileWheatSellItem(1));
            } else {
                needSellWheat = false;
            }
            lastNoChickenWheatSellTime = Date.now();
        }
    } else if (isNoChickenWheatSellDue()) {
        if (cropKeyToSell !== 'wheat') {
            items.push(fertileWheatSellItem(CONFIG.FERTILE_NO_CHICKEN_WHEAT_SELLS));
        }
        lastNoChickenWheatSellTime = Date.now();
    }
    if (needSellEggs && CONFIG.eggSlotInWarehouse && CONFIG.eggSellBtn) items.push(eggSellItem());
    if (needSellMilk && CONFIG.milkSlotInWarehouse && CONFIG.milkSellBtn) items.push(milkSellItem());
    if (items.length === 0) return;
    items.sort(slotOrderCompare);
    warehouseTripCount++;
    log('[仓库] 第' + warehouseTripCount + '趟（' + (reasonText || '卖货') + '）：' + describeSellItems(items));
    openWarehouse();
    runSellQueue(items);
    closeWarehouseToField();
}

function flushEggMilkIfDue() {
    var hasWheat = isChickenEnabled() ? needSellWheat : isNoChickenWheatSellDue();
    var hasEgg = needSellEggs && CONFIG.eggSlotInWarehouse && CONFIG.eggSellBtn;
    var hasMilk = needSellMilk && CONFIG.milkSlotInWarehouse && CONFIG.milkSellBtn;
    if (!hasWheat && !hasEgg && !hasMilk) return;
    var items = [];
    if (isChickenEnabled() && needSellWheat) {
        items.push(fertileWheatSellItem(1));
        lastNoChickenWheatSellTime = Date.now();
    } else if (!isChickenEnabled() && isNoChickenWheatSellDue()) {
        items.push(fertileWheatSellItem(CONFIG.FERTILE_NO_CHICKEN_WHEAT_SELLS));
        lastNoChickenWheatSellTime = Date.now();
    }
    if (hasEgg) items.push(eggSellItem());
    if (hasMilk) items.push(milkSellItem());
    items.sort(slotOrderCompare);
    warehouseTripCount++;
    log('[仓库] 第' + warehouseTripCount + '趟（卖良田小麦/鸡蛋/马奶）：' + describeSellItems(items));
    openWarehouse();
    runSellQueue(items);
    closeWarehouseToField();
}

// ================= [良田] 小麦流程 =================
function clickFertileSafeClose() {
    var pt = FERTILE.SAFE_CLOSE || CONFIG.SAFE_CLOSE;
    click(pt[0], pt[1]);
}
function fertilePlantWheat() {
    var icon = PARAMS.wheat.icon, ct = CONFIG.CENTER_TILE, pts = [];
    for (var i = 0; i < FERTILE.HOLD_PTS; i++) pts.push(icon);
    pts = pts.concat(generateLine(icon, ct, FERTILE.MOVE_STEPS));
    for (var j = 0; j < 4; j++) pts.push(ct);
    var duration = Math.max(pts.length * FERTILE.MS_PER_PT, 500);
    gesture.apply(null, [duration].concat(pts));
}

// 纯良田爆仓清仓：收割后弹出爆仓窗口 → 空地点击消掉弹窗 → 回中 → 仓库卖2次小麦 → 回中 → 重新进良田（无上限循环直到清出空间）
function handleFertileWarehouseFull() {
    toastLog('良田收割后检测到爆仓弹窗，回中去仓库卖2次小麦');
    // 1. 空地点击消除弹窗（仍未消掉再点爆仓关闭键）
    clickFertileSafeClose();
    pausableSleep(500);
    var imgChk = safeCaptureScreen();
    if (imgChk) {
        var stillFull = DriftGuard.isWarehouseFull(imgChk);
        imgChk.recycle();
        if (stillFull) {
            click(CONFIG.warehouseFullCloseBtn[0], CONFIG.warehouseFullCloseBtn[1]);
            pausableSleep(500);
        }
    }
    // 2. 从良田回中
    click(FERTILE.BACK_BTN[0], FERTILE.BACK_BTN[1]);
    pausableSleep(FERTILE.BACK_WAIT_MS);
    clickSafeClose();
    pausableSleep(500);
    // 3. 去仓库卖2次小麦，回中
    warehouseTripCount++;
    log('[仓库] 第' + warehouseTripCount + '趟（纯良田爆仓卖小麦×2）');
    openWarehouse();
    runSellQueue([cropSellItem('wheat', 2)]);
    closeWarehouseToField();
    // 4. 重新进良田
    click(FERTILE.ENTER_BTN[0], FERTILE.ENTER_BTN[1]);
    pausableSleep(FERTILE.ENTER_WAIT_MS);
}

function fertileDue() {
    if (CTRL.settingsOpen || CTRL.paused) return false;
    if (fertileFieldReadyAt === 0) return true;
    return Date.now() >= fertileFieldReadyAt;
}
function silentCheckStationInFertile() {
    sleep(FERTILE.STATION_CHECK_DELAY_MS);
    var img = safeCaptureScreen();
    if (!img) return false;
    var has = false;
    try { has = checkStationHasGoods(img); } catch (e) {}
    img.recycle();
    return has;
}
function doFertileHarvestAndPlantInner() {
    // 调用前已确认读秒到点（小麦已熟）：三连点收割呼出种子栏 → 优先截屏判定是否爆仓弹窗
    while (true) {
        for (var i = 0; i < 3; i++) {
            click(CONFIG.CENTER_TILE[0], CONFIG.CENTER_TILE[1]);
            if (i < 2) sleep(FERTILE.TRIPLE_GAP_MS);
        }
        sleep(FERTILE.PRE_DRAG_MS);
        var imgFull = safeCaptureScreen();
        var isFullNow = false;
        if (imgFull) {
            isFullNow = DriftGuard.isWarehouseFull(imgFull);
            imgFull.recycle();
        }
        if (!isFullNow) break;

        // 常规轮良田触发爆仓（一颗未收，无书帖弹窗）：消爆仓弹窗 → 回中 → 按挡位去仓库变卖 → 重新进良田收种
        toastLog('[良田爆仓] 常规轮良田收割触发爆仓，回仓库变卖后重新进良田收种');
        clickFertileSafeClose();
        pausableSleep(500);
        var imgChk = safeCaptureScreen();
        if (imgChk) {
            var stillFull = DriftGuard.isWarehouseFull(imgChk);
            imgChk.recycle();
            if (stillFull) {
                click(CONFIG.warehouseFullCloseBtn[0], CONFIG.warehouseFullCloseBtn[1]);
                pausableSleep(500);
            }
        }
        click(FERTILE.BACK_BTN[0], FERTILE.BACK_BTN[1]);
        pausableSleep(FERTILE.BACK_WAIT_MS);
        clickSafeClose();
        pausableSleep(500);

        executeOverflowWarehouseSell('常规轮良田收割爆仓');
        roundWarehouseAlreadySold = true;

        click(FERTILE.ENTER_BTN[0], FERTILE.ENTER_BTN[1]);
        pausableSleep(FERTILE.ENTER_WAIT_MS);
    }
    fertilePlantWheat();
    recordFertileFieldPlanted();
    sleep(FERTILE.STEP_GAP_MS);
    clickFertileSafeClose();
    if (silentCheckStationInFertile()) stationGoodsPending = true;
    else sleep(FERTILE.STEP_GAP_MS);
}

// 主田种完后：马上去良田（成熟则顺便0.2s收种，未成熟则仅做借道）→ 马上去上方田地种收 → 回中
function runFertileAndUpperFlow(upperCropKey, upperHarvestOnly) {
    beginAction();
    click(FERTILE.ENTER_BTN[0], FERTILE.ENTER_BTN[1]);
    pausableSleep(FERTILE.ENTER_WAIT_MS);
    if (fertileDue()) {
        log('[良田] 良田小麦已成熟，顺便收种');
        doFertileHarvestAndPlantInner();
    } else {
        var rem = Math.max(0, Math.round((fertileFieldReadyAt - Date.now()) / 1000));
        log('[良田] 良田小麦未成熟（剩' + rem + '秒），仅做借道');
        sleep(FERTILE.STEP_GAP_MS);
    }
    if (isUpperEnabled()) {
        runUpperFieldFlow(upperCropKey || currentCrop, !!upperHarvestOnly);
        return;
    }
    click(FERTILE.BACK_BTN[0], FERTILE.BACK_BTN[1]);
    pausableSleep(FERTILE.BACK_WAIT_MS);
    clickSafeClose();
    pausableSleep(500);
}

function runFertileOnlyFlow(reason) {
    beginAction();
    log('[良田] 良田小麦收种（' + reason + '）');
    click(FERTILE.ENTER_BTN[0], FERTILE.ENTER_BTN[1]);
    pausableSleep(FERTILE.ENTER_WAIT_MS);
    doFertileHarvestAndPlantInner();
    click(FERTILE.BACK_BTN[0], FERTILE.BACK_BTN[1]);
    pausableSleep(FERTILE.BACK_WAIT_MS);
    clickSafeClose();
    pausableSleep(500);
    if (stationGoodsPending) collectStationGoods();
}

// ================= 自动挡红箭头疲劳Debuff检测 =================
function hasRedDebuffArrowInRegion(img, rect) {
    var targetC = colors.rgb(CONFIG.debuffTargetColor[0], CONFIG.debuffTargetColor[1], CONFIG.debuffTargetColor[2]);
    try {
        var pts = images.findAllPointsForColor(img, targetC, {
            region: rect,
            threshold: CONFIG.debuffColorTolerance
        });
        return pts && pts.length >= CONFIG.debuffMinPixels;
    } catch (e) {
        var x0 = rect[0], y0 = rect[1], w = rect[2], h = rect[3];
        var match = 0;
        for (var dx = 0; dx < w; dx += 3) {
            for (var dy = 0; dy < h; dy += 3) {
                var c = images.pixel(img, x0 + dx, y0 + dy);
                var diff = Math.max(
                    Math.abs(colors.red(c) - CONFIG.debuffTargetColor[0]),
                    Math.abs(colors.green(c) - CONFIG.debuffTargetColor[1]),
                    Math.abs(colors.blue(c) - CONFIG.debuffTargetColor[2])
                );
                if (diff <= CONFIG.debuffColorTolerance) {
                    match++;
                    if (match >= 6) return true;
                }
            }
        }
        return false;
    }
}

function checkAndHandleAutoDebuffAfterPlant(cropKey) {
    if (currentDriveMode !== 'auto' || autoDebuffTriggered || autoPhase === 'corn_loop') return;
    if (cropKey !== 'rice' && cropKey !== 'soy' && cropKey !== 'cane') return;
    var img = safeCaptureScreen();
    if (!img) return;
    var hit1 = hasRedDebuffArrowInRegion(img, CONFIG.debuffCheckRegions[0]);
    var hit2 = hasRedDebuffArrowInRegion(img, CONFIG.debuffCheckRegions[1]);
    img.recycle();
    if (!hit1 && !hit2) return;

    autoDebuffTriggered = true;
    autoCurrentRoundNoSell = true;
    var hitPosStr = (hit1 ? '(500,200) ' : '') + (hit2 ? '(600,200)' : '');
    if (cropKey === 'cane') {
        autoPhase = 'cane_debuff_tail';
        autoStepIdx = -1;
        toastLog('【检测到甘蔗疲劳红箭头】位置' + hitPosStr + '！本轮甘蔗不卖 → 接水稻、大豆 → 转玉米循环');
    } else {
        autoPhase = 'corn_loop';
        autoCornRoundCount = 0;
        toastLog('【检测到' + CROPS[cropKey].label + '疲劳红箭头】位置' + hitPosStr + '！本轮不卖 → 下轮直接转玉米循环');
    }
}

// ================= 主田种收与等待巡检 =================
function handlePostLoopPopups(stageLabel, cropKey) {
    var ck = cropKey || currentCrop;
    if (ck === 'wheat' || ck === 'rice') {
        log('[弹窗消除] ' + stageLabel + ' 结束，连点右下角 2.5 秒');
        var endAt = Date.now() + 2500;
        while (Date.now() < endAt) {
            clickSafeClose();
            pausableSleep(200);
        }
        pausableSleep(200);
    }
}

function plantAll(cropKey, menuAlreadyOpen) {
    CTRL.currentPhase = 'plant';
    currentCrop = cropKey;
    plantDone = false;
    bubbleDetectSuspended = false;
    if (!menuAlreadyOpen) {
        clickAndAwaitMenu(CONFIG.targetTile[0], CONFIG.targetTile[1], 'plant');
    }
    var dispName = getCropDisplayName(cropKey);
    toastLog("== 播种" + dispName + " ==");
    // 开始种第一棵的瞬间立即开始计时（主田收割自带1s readyBufferMs延迟）
    recordMainFieldPlanted(cropKey);
    dragFarmLoop(CROPS[cropKey].plantKey);
    pausableSleep(500);
    handlePostLoopPopups('播种' + dispName, cropKey);
    checkAndHandleAutoDebuffAfterPlant(cropKey);

    var driftResult = DriftGuard.softCheck('plant');
    if (driftResult === 'warehouseFull') {
        handleWarehouseFullUnified('plant-softCheck', false);
    } else if (driftResult === 'suspected') {
        pausableSleep(1000);
        var confirmResult = DriftGuard.finalCheck('plant_immediate');
        if (confirmResult === 'drift') {
            var result = recoverFromFreeze('plant种植后偏移', 'drift');
            throw new RecoveredCycleSignal(result.mode, result.menuAlreadyOpen);
        } else if (confirmResult === 'warehouseFull') {
            handleWarehouseFullUnified('plant-immediate', false);
        }
    }
}

function bubbleTick() {
    if (bubbleDetectSuspended || bubbleFlowActive || CTRL.settingsOpen) return;
    var r1 = checkAndRunFarmTasks();
    var r2 = (r1 === 'none') ? checkAndRunRanchTasks() : 'none';
    if (r1 !== 'none' || r2 !== 'none') {
        clickSafeClose();
        pausableSleep(500);
    }
    flushEggMilkIfDue();
}

function openMenuForHarvest() {
    clickAndAwaitMenu(CONFIG.targetTile[0], CONFIG.targetTile[1], 'harvest');
}

function waitReadyAndHarvest(forceNow, isCornPumpkinMode) {
    CTRL.currentPhase = 'wait';
    bubbleFlowActive = false;
    var activePlantedKey = mainPlantedCrop || currentCrop;
    var dispName = getCropDisplayName(activePlantedKey);
    if (forceNow) {
        mainFieldReadyAt = Date.now();
    }

    clickSafeClose();
    pausableSleep(500);
    var initRemainSec = Math.max(0, Math.round((mainFieldReadyAt - Date.now()) / 1000));
    toastLog('等待' + dispName + '成熟，剩余 ' + initRemainSec + ' 秒');

    var pollMs = Math.max(1, PANEL.BUBBLE_POLL_SEC) * 1000;
    var stopMs = Math.max(0, CONFIG.BUBBLE_STOP_BEFORE_READY_SEC) * 1000;
    var preHarvestChecked = false;
    var preFertileChecked = false;

    if (mainFieldReadyAt - Date.now() > stopMs) {
        bubbleTick();
    }

    while (Date.now() < mainFieldReadyAt) {
        setActionInProgress(false);
        var centerRes = DriftGuard.checkWaitCenter();
        if (centerRes === 'warehouseFull') {
            handleWarehouseFullUnified('wait_poll_wfull', false);
        } else if (centerRes === 'drift') {
            var waitDriftRes = recoverFromFreeze('5秒常驻检测发现画面不在中心', 'drift');
            throw new RecoveredCycleSignal(waitDriftRes.mode, waitDriftRes.menuAlreadyOpen);
        }

        // 【玉米南瓜专属】：主田南瓜满1小时后，上方田地第1轮玉米成熟，去上方收第1轮玉米并种第2轮玉米（动态读取当前是否处于玉米南瓜挡）
        var activeCPMode = isCornPumpkinMode || ((nextDriveMode || currentDriveMode) === 'manual' && (nextManualGear || currentManualGear) === 'corn_pumpkin');
        if (activeCPMode && !cornPumpkinSecondCornDone && isUpperEnabled() && upperFieldReadyAt > 0) {
            var remUpper = upperFieldReadyAt - Date.now();
            if (remUpper <= pollMs && mainFieldReadyAt - Date.now() > stopMs) {
                if (remUpper > 0) pausableSleep(remUpper);
                DriftGuard.ensureCenteredBeforeDueAction('上方玉米收种');
                log('[玉米南瓜] 上方田地第1轮玉米已满1小时，去上方收割第1轮玉米并播种第2轮玉米');
                runFertileAndUpperFlow('corn', false);
                cornPumpkinSecondCornDone = true;
                if (stationGoodsPending) collectStationGoods();
            }
        }

        // 当读秒第一次进入小于间隔时间（如剩4秒）即将去良田时，核对是否发生偏移（若偏移检测关则自动暂停）
        var remainToMain = mainFieldReadyAt - Date.now();
        if (remainToMain > stopMs && fertileFieldReadyAt > 0) {
            var remainToFertile = fertileFieldReadyAt - Date.now();
            if (remainToFertile <= pollMs && !preFertileChecked) {
                preFertileChecked = true;
                if (remainToFertile > 0 && remainToFertile < pollMs) {
                    pausableSleep(Math.max(0, remainToFertile - 1000));
                }
                DriftGuard.ensureCenteredBeforeDueAction('良田收种');
            }
        }

        remainToMain = mainFieldReadyAt - Date.now();
        // 当主田读秒第一次进入小于等于间隔时间（如剩4秒）时，核对是否发生偏移（若偏移检测关则自动暂停）
        if (remainToMain <= pollMs) {
            if (!preHarvestChecked) {
                preHarvestChecked = true;
                DriftGuard.ensureCenteredBeforeDueAction('主田收割');
            }
            var finalRem = mainFieldReadyAt - Date.now();
            if (finalRem > 0) pausableSleep(finalRem);
            break;
        }

        if (remainToMain <= stopMs) {
            pausableSleep(Math.min(1000, remainToMain - pollMs));
            continue;
        }

        pausableSleep(Math.min(pollMs, remainToMain - stopMs));
        if (mainFieldReadyAt - Date.now() <= stopMs) continue;

        var centerRes2 = DriftGuard.checkWaitCenter();
        if (centerRes2 === 'warehouseFull') {
            handleWarehouseFullUnified('wait_poll2_wfull', false);
        } else if (centerRes2 === 'drift') {
            var waitDriftRes2 = recoverFromFreeze('5秒常驻检测发现画面不在中心', 'drift');
            throw new RecoveredCycleSignal(waitDriftRes2.mode, waitDriftRes2.menuAlreadyOpen);
        }

        bubbleTick();
        if (mainFieldReadyAt - Date.now() > stopMs && fertileDue()) {
            DriftGuard.ensureCenteredBeforeDueAction('良田收种');
            runFertileOnlyFlow('等待期定时');
            preFertileChecked = false;
        }
    }

    beginAction();
    CTRL.currentPhase = 'harvest';
    openMenuForHarvest();
    harvestAll(true);
}

function finishOverflowWheatRescueIfActive() {
    if (inOverflowWheatRescue) {
        inOverflowWheatRescue = false;
        if (savedCropBeforeRescue) {
            currentCrop = savedCropBeforeRescue;
            savedCropBeforeRescue = null;
        }
        extraOverflowWheatSells += 2;
        bubbleDetectSuspended = false;
        log('[主田爆仓小麦清场] 2分钟小麦清场完成，已恢复气泡检测，下一轮上下收完回仓库将额外多卖小麦×2');
    }
}

// 主田收割爆仓专属处理：先去仓库变卖 → 回主田补种一轮2分钟小麦 → 过良田（按计时收种或路过）→ 上方田地收掉未收作物并种一轮小麦 → 跳过气泡检测等2分钟收割主田 → 标记下轮多卖2次小麦
function handleMainFieldHarvestOverflow(overflowedCropKey) {
    toastLog('【主田收割爆仓】先去仓库变卖，随后上下补种一轮2分钟小麦快速清掉残余成熟作物');
    click(CONFIG.warehouseFullCloseBtn[0], CONFIG.warehouseFullCloseBtn[1]);
    pausableSleep(500);
    clickSafeClose();
    pausableSleep(500);

    // 1. 第一步：先回仓库按当前挡位策略变卖清仓
    executeOverflowWarehouseSell('主田收割爆仓');

    // 2. 第二步：启动一轮2分钟小麦清场（全程跳过气泡检测）
    savedCropBeforeRescue = currentCrop;
    inOverflowWheatRescue = true;
    bubbleDetectSuspended = true;

    plantAll('wheat', false);
    // plantAll 内部会将 bubbleDetectSuspended 置为 false，这里立即重新挂起气泡检测（不弹额外文字提示）
    bubbleDetectSuspended = true;

    // 过良田（看计时收种或路过）→ 去上方田地收掉原本未收的成熟作物并种上一轮小麦
    runFertileAndUpperFlow('wheat', false);
    clickSafeClose();
    pausableSleep(500);

    if (stationGoodsPending) collectStationGoods();

    var midRes = DriftGuard.midFlowRecheck();
    if (midRes === 'drift') {
        var midDet = recoverFromFreeze('主田爆仓小麦补种midflow偏移', 'drift');
        throw new RecoveredCycleSignal(midDet.mode, midDet.menuAlreadyOpen);
    } else if (midRes === 'warehouseFull') {
        executeOverflowWarehouseSell('主田爆仓小麦补种midflow爆仓');
    }

    // 3. 等待2分钟（期间跳过气泡检测），到点后收割主田小麦及残余成熟作物
    bubbleDetectSuspended = true;
    waitReadyAndHarvest(false, false);

    // 4. 清场完成，恢复原挡位作物与气泡检测，并标记下一轮上下收完回仓库时小麦多卖2次
    finishOverflowWheatRescueIfActive();
}

function harvestAll(menuAlreadyOpen) {
    CTRL.currentPhase = 'harvest';
    var harvKey = mainPlantedCrop || currentCrop;
    if (!menuAlreadyOpen) {
        clickAndAwaitMenu(CONFIG.targetTile[0], CONFIG.targetTile[1], 'harvest');
    }
    var preReleaseFull = dragFarmLoop(CROPS[harvKey].harvestKey, harvKey);
    pausableSleep(500);
    handlePostLoopPopups('收割' + getCropDisplayName(harvKey), harvKey);

    if (preReleaseFull) {
        handleMainFieldHarvestOverflow(harvKey);
        return;
    }

    var result = DriftGuard.finalCheck('harvest');
    if (result === 'ok') {
        plantDone = false;
        mainFieldReadyAt = 0;
        if (inOverflowWheatRescue) {
            finishOverflowWheatRescueIfActive();
        } else if (bubbleDetectSuspended) {
            bubbleDetectSuspended = false;
        }
        var imgStation = safeCaptureScreen();
        if (imgStation) {
            if (checkStationHasGoods(imgStation)) stationGoodsPending = true;
            imgStation.recycle();
        }
        return;
    }
    if (result === 'warehouseFull') {
        handleMainFieldHarvestOverflow(harvKey);
        return;
    }
    var result2 = recoverFromFreeze('harvest收割后确认偏移', 'drift');
    throw new RecoveredCycleSignal(result2.mode, result2.menuAlreadyOpen);
}

// ================= 纯良田独立挂机（带左鸡舍屋顶独立参考图与种后2秒偏移检测） =================
function runPureFertileStep() {
    hasEverPlantedMainField = true;
    if (nextDriveMode !== 'manual' || nextManualGear !== 'fertile') {
        applyPendingModeAndGearSwitch();
        return;
    }
    beginAction();
    if (!fertileReferencePatch) {
        captureFertileReferencePatch();
    }

    // 先等熟再动手：读秒没走完（暂停后点继续 / 断线回良田后）就原地等，绝不在未成熟小麦上点击+拖拽
    if (fertileFieldReadyAt > Date.now()) {
        setActionInProgress(false);
        var remSec = Math.max(0, Math.round((fertileFieldReadyAt - Date.now()) / 1000));
        var dLabel = debuffGearState.fertile ? "小麦（减益）" : "小麦";
        toastLog("继续等待良田" + dLabel + "，剩余 " + remSec + " 秒");
        while (Date.now() < fertileFieldReadyAt) {
            if (nextDriveMode !== 'manual' || nextManualGear !== 'fertile') {
                applyPendingModeAndGearSwitch();
                return;
            }
            pausableSleep(1000);
        }
        if (nextDriveMode !== 'manual' || nextManualGear !== 'fertile') {
            applyPendingModeAndGearSwitch();
            return;
        }
        beginAction();
    }

    // 1. 三连点中间土地：收割并呼出种子栏；紧接着截一张图判爆仓（无次数上限，一旦爆仓回仓库卖2次小麦再回良田继续）
    while (true) {
        for (var i = 0; i < 3; i++) {
            click(CONFIG.CENTER_TILE[0], CONFIG.CENTER_TILE[1]);
            if (i < 2) sleep(80);
        }
        pausableSleep(FERTILE.PRE_DRAG_MS);
        var imgFull = safeCaptureScreen();
        var isFullNow = false;
        if (imgFull) {
            isFullNow = DriftGuard.isWarehouseFull(imgFull);
            imgFull.recycle();
        }
        if (!isFullNow) break;
        handleFertileWarehouseFull();
    }

    // 2. 拖一颗小麦到中心脱手，随后开始读秒
    fertilePlantWheat();
    recordFertileFieldPlanted();
    pausableSleep(200);
    clickFertileSafeClose();
    pausableSleep(200);

    // 3. 选中间土地定住镜头
    click(CONFIG.CENTER_TILE[0], CONFIG.CENTER_TILE[1]);

    // 4. 种完过2秒检测左鸡舍屋顶参考框 [1747,404]~[1823,437] 是否发生偏移
    pausableSleep(2000);
    var imgCheck = safeCaptureScreen();
    if (imgCheck) {
        var ok = matchFertileReference(imgCheck);
        imgCheck.recycle();
        if (!ok) {
            if (isDriftCheckOn()) {
                recoverPureFertileFromDrift();
            } else {
                pauseScriptOnOffset("良田画面偏移，已自动暂停");
            }
        }
    }

    setActionInProgress(false);
    var remainWaitSec = Math.max(0, Math.round((fertileFieldReadyAt - Date.now()) / 1000));
    var dispLabel = debuffGearState.fertile ? "小麦（减益）" : "小麦";
    toastLog("良田" + dispLabel + "等待 " + remainWaitSec + " 秒");
    while (Date.now() < fertileFieldReadyAt) {
        if (nextDriveMode !== 'manual' || nextManualGear !== 'fertile') {
            applyPendingModeAndGearSwitch();
            return;
        }
        pausableSleep(1000);
    }
}

// ================= 自动挡步骤推进逻辑 =================
function getCurrentAutoStepConfig() {
    if (autoPhase === 'normal') {
        var s = AUTO_NORMAL_STEPS[autoStepIdx % AUTO_NORMAL_STEPS.length];
        var times = s.sellTimes;
        if (s.crop === 'rice' && !isChickenEnabled()) times = 2;
        return { crop: s.crop, sellTimes: times };
    }
    if (autoPhase === 'cane_debuff_tail') {
        var idx = Math.max(0, autoStepIdx);
        var s2 = AUTO_TAIL_STEPS[idx];
        var times2 = s2.sellTimes;
        if (s2.crop === 'rice' && !isChickenEnabled()) times2 = 2;
        return { crop: s2.crop, sellTimes: times2 };
    }
    var cornSell = (autoCornRoundCount === 0) ? 0 : 1;
    return { crop: 'corn', sellTimes: cornSell };
}

function advanceAutoStepAfterHarvest() {
    var curCfg = getCurrentAutoStepConfig();
    if (autoCurrentRoundNoSell) {
        autoPendingSellCrop = null;
        autoPendingSellTimes = 0;
    } else {
        autoPendingSellCrop = curCfg.crop;
        autoPendingSellTimes = curCfg.sellTimes;
    }
    autoCurrentRoundNoSell = false;

    if (autoPhase === 'normal') {
        autoStepIdx = (autoStepIdx + 1) % AUTO_NORMAL_STEPS.length;
    } else if (autoPhase === 'cane_debuff_tail') {
        autoStepIdx++;
        if (autoStepIdx >= AUTO_TAIL_STEPS.length) {
            autoPhase = 'corn_loop';
            autoCornRoundCount = 0;
        }
    } else {
        autoCornRoundCount++;
    }
}

// ================= 暂停恢复与读秒归零询问（种植 / 收割 / 取消） =================
function applyPendingModeAndGearSwitch() {
    var switched = false;
    if (nextDriveMode !== currentDriveMode) {
        currentDriveMode = nextDriveMode;
        switched = true;
    }
    if (currentDriveMode === 'manual' && nextManualGear !== currentManualGear) {
        currentManualGear = nextManualGear;
        switched = true;
    }
    // 仅当主田未处于正在生长的读秒期时，才切换 currentCrop；若主田正在读秒，保持原有作物读秒直到0完成
    if (!plantDone || mainFieldReadyAt <= 0 || Date.now() >= mainFieldReadyAt) {
        if (currentDriveMode === 'auto') {
            currentCrop = getCurrentAutoStepConfig().crop;
        } else {
            if (currentManualGear === 'corn_pumpkin') {
                currentCrop = 'pumpkin';
            } else if (CROPS[currentManualGear]) {
                currentCrop = currentManualGear;
            }
        }
    }
    if (switched) {
        syncUI();
    }
}

// 当点继续时若读秒已归零（且非打开脚本第一次种植），弹出询问【种植 / 收割 / 取消】
var activeZeroTimerDlg = null;
function promptPlantOrHarvestOnZeroTimer() {
    var actionClicked = null;
    if (activeZeroTimerDlg) {
        try { activeZeroTimerDlg.dismiss(); } catch (e) {}
        activeZeroTimerDlg = null;
    }
    var dlg = dialogs.build({
        title: "读秒已归零",
        content: "请选择接下来要执行的动作：",
        positive: "种植",
        negative: "收割",
        neutral: "取消",
        cancelable: false,
        canceledOnTouchOutside: false
    }).on("any", function (action) {
        actionClicked = action;
    }).on("cancel", function () {
        if (actionClicked == null) actionClicked = "cancel";
    }).on("dismiss", function () {
        if (actionClicked == null) actionClicked = "cancel";
    });
    activeZeroTimerDlg = dlg;
    dlg.show();
    while (actionClicked == null) {
        sleep(100);
        renewLock();
        if (CTRL.paused || pauseTriggered || justResetAllTimers) {
            try { dlg.dismiss(); } catch (e) {}
            activeZeroTimerDlg = null;
            return "cancel";
        }
    }
    activeZeroTimerDlg = null;
    return actionClicked; // "positive"=种植, "negative"=收割, "neutral"/"cancel"=取消
}

var justResetAllTimers = false;
function resetAllTimersToZero() {
    if (activeZeroTimerDlg) {
        try { activeZeroTimerDlg.dismiss(); } catch (e) {}
        activeZeroTimerDlg = null;
    }
    // 1. 主田计时归零（保留 hasEverPlantedMainField = true，确保点中心地后按播放依然询问【种植 / 收割 / 取消】）
    hasEverPlantedMainField = true;
    mainPlantedCrop = null;
    lastPlantTime = 0;
    mainFieldReadyAt = 0;
    plantDone = false;

    // 2. 上方田地计时归零
    upperPlantedCrop = null;
    upperLastPlantTime = 0;
    upperFieldReadyAt = 0;
    cornPumpkinSecondCornDone = false;

    // 3. 良田计时归零
    fertileLastPlantTime = 0;
    fertileFieldReadyAt = 0;

    // 4. 鸡舍与马厩计时及计数归零
    chickenLeftNoBubbleSince = 0;
    chickenRightNoBubbleSince = 0;
    ranchLeftNoBubbleSince = 0;
    ranchRightNoBubbleSince = 0;
    chickenRunCount = 0;
    ranchRunCount = 0;
    needSellWheat = false;
    needSellEggs = false;
    needSellMilk = false;
    lastNoChickenWheatSellTime = Date.now();
    pauseRanchAfterRiceOverflow = false;
    bubbleFlowActive = false;
    bubbleDetectSuspended = false;
    stationGoodsPending = false;
    inOverflowWheatRescue = false;
    savedCropBeforeRescue = null;
    extraOverflowWheatSells = 0;
    roundWarehouseAlreadySold = false;

    // 5. 自动挡轮次与流程标记重置
    autoPhase = 'normal';
    autoStepIdx = 0;
    autoDebuffTriggered = false;
    autoCurrentRoundNoSell = false;
    autoCornRoundCount = 0;
    autoPendingSellCrop = null;
    autoPendingSellTimes = 0;
    skipToHarvestOnce = false;
    skipWaitOnce = false;
    pendingMenuAlreadyOpen = false;
    centerTouched = false;

    // 6. 清空旧基准图，下次点▶时重新采集当前画面作为新基准图（完全等同于重启脚本）
    if (referencePatch) {
        try { referencePatch.recycle(); } catch (e) {}
        referencePatch = null;
    }
    if (fertileReferencePatch) {
        try { fertileReferencePatch.recycle(); } catch (e) {}
        fertileReferencePatch = null;
    }
    DriftGuard.reset();

    applyPendingModeAndGearSwitch();
    syncUI();
}

function handlePauseAndResume() {
    while (true) {
        setActionInProgress(false);
        while (CTRL.paused) {
            sleep(150);
            renewLock();
        }
        if (justResetAllTimers) {
            resetAllTimersToZero();
            justResetAllTimers = false;
        }
        pauseTriggered = false;
        setActionInProgress(true);

        try {
            if (nextDriveMode === 'manual' && nextManualGear === 'fertile') {
                currentDriveMode = 'manual';
                currentManualGear = 'fertile';
                syncUI();
                return;
            }

            // 情况1：脚本刚启动第一次点继续（尚未种过主田且未执行过长按重置），直接默认开始种植，不弹窗询问
            if (!hasEverPlantedMainField) {
                applyPendingModeAndGearSwitch();
                pausableSleep(300);
                clickSafeClose();
                pausableSleep(400);
                if (!referencePatch) captureReferencePatch();
                DriftGuard.reset();
                bubbleDetectSuspended = false;
                skipToHarvestOnce = false;
                skipWaitOnce = false;
                pendingMenuAlreadyOpen = false;
                return;
            }

            // 情况2：主田读秒尚未归零，直接继续走原读秒等待，绝不重置或丢失进度（同时同步挡位开关配置）
            if (mainFieldReadyAt > Date.now()) {
                applyPendingModeAndGearSwitch();
                pausableSleep(300);
                clickSafeClose();
                pausableSleep(400);
                if (!referencePatch) captureReferencePatch();
                DriftGuard.reset();
                bubbleDetectSuspended = false;
                var remainSec = Math.max(0, Math.round((mainFieldReadyAt - Date.now()) / 1000));
                toastLog('继续等待' + getCropDisplayName(mainPlantedCrop || currentCrop) + '，剩余 ' + remainSec + ' 秒');
                skipToHarvestOnce = true;
                skipWaitOnce = false;
                pendingMenuAlreadyOpen = false;
                return;
            }

            // 情况3：后续点继续时读秒已归零（含长按重置后），弹窗询问【种植 / 收割 / 取消】
            var userChoice = promptPlantOrHarvestOnZeroTimer();
            if (userChoice !== "positive" && userChoice !== "negative") {
                CTRL.paused = true;
                syncUI();
                continue;
            }

            pausableSleep(300);
            clickSafeClose();
            pausableSleep(500);
            if (!referencePatch) captureReferencePatch();
            DriftGuard.reset();
            bubbleDetectSuspended = false;

            if (userChoice === "positive") {
                // 用户选择【种植】：应用新选好的挡位，上下田都直接走种植
                plantDone = false;
                mainFieldReadyAt = 0;
                upperLastPlantTime = 0;
                upperPlantedCrop = null;
                upperFieldReadyAt = 0;
                applyPendingModeAndGearSwitch();
                skipToHarvestOnce = false;
                skipWaitOnce = false;
                pendingMenuAlreadyOpen = false;
                toastLog('开始种植：' + getCropDisplayName(currentCrop));
                return;
            } else {
                // 用户选择【收割】：上下田严格对齐（同收同种）
                // 不在 handlePauseAndResume 内直接跑 clickAndAwaitMenu（交由主循环 try 块统一执行，防止异常跳出主循环导致卡死）
                var harvestCropKey = mainPlantedCrop || currentCrop;
                applyPendingModeAndGearSwitch();
                var targetHarvKey = mainPlantedCrop || currentCrop || harvestCropKey;
                toastLog('开始收割：' + getCropDisplayName(targetHarvKey));
                upperPlantedCrop = upperPlantedCrop || ((currentDriveMode === 'manual' && currentManualGear === 'corn_pumpkin') ? 'corn' : targetHarvKey);
                upperLastPlantTime = Date.now();
                upperFieldReadyAt = Date.now();
                skipToHarvestOnce = true;
                skipWaitOnce = true;
                pendingMenuAlreadyOpen = false;
                return;
            }
        } catch (e2) {
            if (e2 instanceof PauseSignal) {
                CTRL.paused = true;
                syncUI();
                continue;
            }
            throw e2;
        }
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

// ================= 悬浮窗 UI（紧凑不超边 + 长按1秒切换黄色减益） =================
var MANUAL_GEAR_LABELS = {
    wheat:        '小麦',
    rice:         '水稻',
    soy:          '大豆',
    cane:         '甘蔗',
    corn:         '玉米',
    pumpkin:      '南瓜',
    corn_pumpkin: '玉米南瓜',
    fertile:      '良田'
};

function getHeaderModeText() {
    if (nextDriveMode === 'auto') {
        return "自动:" + (CROPS[currentCrop] ? CROPS[currentCrop].label : "轮种");
    }
    var g = nextManualGear;
    var base = MANUAL_GEAR_LABELS[g] || "大豆";
    if (debuffGearState[g]) {
        return "手动:" + base + "（减益）";
    }
    return "手动:" + base;
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

function syncSpeedSliderUI() {
    if (!ctrlWin) return;
    ctrlWin.speedValTxt.post(function () {
        ctrlWin.speedValTxt.setText(formatSpeedLabel());
    });
    ctrlWin.sliderTrack.post(function () {
        try {
            var trackW = ctrlWin.sliderTrack.getWidth();
            var thumbW = ctrlWin.sliderThumb.getWidth();
            if (trackW > 0 && thumbW > 0) {
                var maxLeft = Math.max(0, trackW - thumbW);
                var leftPx = Math.round(speedSliderPos * maxLeft);
                var lp = ctrlWin.sliderThumb.getLayoutParams();
                lp.leftMargin = leftPx;
                ctrlWin.sliderThumb.setLayoutParams(lp);
                var isAtYellow = Math.abs(speedSliderPos - (2.0 / 3.0)) <= 0.03;
                ctrlWin.sliderThumb.setBackgroundColor(colors.parseColor(isAtYellow ? "#FFD54F" : "#4CAF50"));
            }
        } catch (e) {}
    });
}

function syncUI() {
    if (!ctrlWin) return;
    var isAuto = (nextDriveMode === 'auto');
    var opts = getActiveOpts(nextDriveMode);

    ctrlWin.btnModeAuto.post(function () {
        ctrlWin.btnModeAuto.setText(isAuto ? "● 自动挡" : "自动挡");
        try { ctrlWin.btnModeAuto.setBackgroundColor(colors.parseColor(isAuto ? "#1E88E5" : "#555555")); } catch (e) {}
    });
    ctrlWin.btnModeManual.post(function () {
        ctrlWin.btnModeManual.setText(!isAuto ? "● 手动挡" : "手动挡");
        try { ctrlWin.btnModeManual.setBackgroundColor(colors.parseColor(!isAuto ? "#4CAF50" : "#555555")); } catch (e) {}
    });

    // 自动挡显示滑动变速（两挡同步）；手动挡显示手动挡位
    setRowVisible(ctrlWin.autoSpeedBox, isAuto);
    setRowVisible(ctrlWin.manualBox, !isAuto);

    // 手动挡八项按钮状态
    var gearMap = {
        wheat:        ctrlWin.gearWheatBtn,
        rice:         ctrlWin.gearRiceBtn,
        soy:          ctrlWin.gearSoyBtn,
        cane:         ctrlWin.gearCaneBtn,
        corn:         ctrlWin.gearCornBtn,
        pumpkin:      ctrlWin.gearPumpkinBtn,
        corn_pumpkin: ctrlWin.gearCornPumpkinBtn,
        fertile:      ctrlWin.gearFertileBtn
    };
    for (var gk in gearMap) {
        (function (key, btn) {
            btn.post(function () {
                if (key === 'corn_pumpkin' && !MANUAL_OPTS.upper) {
                    try {
                        btn.setBackgroundColor(colors.parseColor("#383838"));
                        btn.setTextColor(colors.parseColor("#777777"));
                    } catch (e) {}
                    return;
                }
                var active = (nextManualGear === key);
                var isDebuff = !!debuffGearState[key];
                try {
                    btn.setBackgroundColor(colors.parseColor(active ? "#4CAF50" : "#555555"));
                    if (isDebuff) {
                        btn.setTextColor(colors.parseColor("#FFD54F"));
                    } else {
                        btn.setTextColor(colors.parseColor("#FFFFFF"));
                    }
                } catch (e) {}
            });
        })(gk, gearMap[gk]);
    }

    syncSpeedSliderUI();

    if (opts.upper) setToggleOn(ctrlWin.upperTgl); else setToggleOff(ctrlWin.upperTgl);
    if (opts.chicken) setToggleOn(ctrlWin.chickenTgl); else setToggleOff(ctrlWin.chickenTgl);
    if (opts.ranch) setToggleOn(ctrlWin.ranchTgl); else setToggleOff(ctrlWin.ranchTgl);
    if (opts.stationLoad) setToggleOn(ctrlWin.stationLoadTgl); else setToggleOff(ctrlWin.stationLoadTgl);
    if (opts.driftCheck) setToggleOn(ctrlWin.driftCheckTgl); else setToggleOff(ctrlWin.driftCheckTgl);

    ctrlWin.modeTxt.post(function () {
        ctrlWin.modeTxt.setText(" " + getHeaderModeText() + " ");
        var showYellow = (nextDriveMode === 'manual' && !!debuffGearState[nextManualGear]);
        try { ctrlWin.modeTxt.setTextColor(colors.parseColor(showYellow ? "#FFD54F" : "#4CAF50")); } catch (e) {}
    });
    ctrlWin.ppBtn.post(function () {
        ctrlWin.ppBtn.setText(CTRL.paused ? " ▶ " : " ⏸ ");
        try { ctrlWin.ppBtn.setTextColor(colors.parseColor(CTRL.paused ? "#4CAF50" : "#FF5252")); } catch (e) {}
    });
}

function selectDriveMode(targetMode) {
    nextDriveMode = targetMode;
    saveUIConfig();
    if (CTRL.paused) {
        currentDriveMode = targetMode;
        if (!plantDone || mainFieldReadyAt <= 0 || Date.now() >= mainFieldReadyAt) {
            if (currentDriveMode === 'auto') {
                currentCrop = getCurrentAutoStepConfig().crop;
            } else {
                currentCrop = (currentManualGear === 'corn_pumpkin') ? 'pumpkin' : (CROPS[currentManualGear] ? currentManualGear : 'soy');
            }
        }
    }
    syncUI();
}

function selectManualGear(targetGear) {
    if (targetGear === 'corn_pumpkin' && !MANUAL_OPTS.upper) {
        toastLog("上方田地已关闭，无法选择玉米南瓜");
        return;
    }
    nextManualGear = targetGear;
    nextDriveMode = 'manual';
    saveUIConfig();
    if (CTRL.paused) {
        currentDriveMode = 'manual';
        currentManualGear = targetGear;
        if (!plantDone || mainFieldReadyAt <= 0 || Date.now() >= mainFieldReadyAt) {
            if (targetGear === 'corn_pumpkin') {
                currentCrop = 'pumpkin';
            } else if (CROPS[targetGear]) {
                currentCrop = targetGear;
            }
        }
    }
    syncUI();
}

// 绑定支持短按选择挡位 + 长按1秒切换黄色减益(Debuff)的按钮事件
function bindGearButtonWithLongPress(btnView, gearKey, allowDebuff) {
    var downTime = 0;
    var pressing = false;
    var longPressTriggered = false;

    btnView.setOnTouchListener(function (view, event) {
        var action = event.getAction();
        if (action === event.ACTION_DOWN) {
            downTime = Date.now();
            pressing = true;
            longPressTriggered = false;
            if (allowDebuff) {
                var thisDownTime = downTime;
                threads.start(function () {
                    sleep(1000);
                    if (pressing && downTime === thisDownTime && !longPressTriggered) {
                        longPressTriggered = true;
                        selectManualGear(gearKey);
                        var newState = !debuffGearState[gearKey];
                        debuffGearState[gearKey] = newState;
                        syncUI();
                        if (gearKey === 'fertile') {
                            if (newState) {
                                var applyAll = dialogs.confirm("良田减益设置", "是否让其他流程也沿用该良田配置（4分钟）？");
                                fertileDebuffApplyToAll = !!applyAll;
                            } else {
                                fertileDebuffApplyToAll = false;
                                toastLog("所有良田时间已重置回2分钟");
                            }
                            if (fertileLastPlantTime > 0 && fertileFieldReadyAt > Date.now()) {
                                fertileFieldReadyAt = fertileReadyAtFrom(fertileLastPlantTime);
                            }
                        } else {
                            if (mainPlantedCrop === gearKey && lastPlantTime > 0 && mainFieldReadyAt > Date.now()) {
                                mainFieldReadyAt = lastPlantTime + getCropCooldownSec(gearKey) * 1000 + CONFIG.readyBufferMs;
                            }
                            if (upperPlantedCrop === gearKey && upperLastPlantTime > 0 && upperFieldReadyAt > Date.now()) {
                                upperFieldReadyAt = upperLastPlantTime + getCropCooldownSec(gearKey) * 1000;
                            }
                        }
                        syncUI();
                    }
                });
            }
            return true;
        }
        if (action === event.ACTION_UP || action === event.ACTION_CANCEL) {
            pressing = false;
            if (!longPressTriggered && action === event.ACTION_UP) {
                selectManualGear(gearKey);
            }
            return true;
        }
        return true;
    });
}

function createControlPanel() {
    ctrlWin = floaty.window(
        <vertical id="root" w="auto" h="auto">
            <horizontal id="bar" bg="#CC333333" w="auto" h="34" gravity="center_vertical" padding="2">
                <text id="drag" text=" ≡ " textColor="#999999" textSize="14sp" w="28" h="34" gravity="center"/>
                <frame w="1" h="20" bg="#555555"/>
                <text id="setBtn" text=" ⚙ " textColor="#CCCCCC" textSize="15sp" w="34" h="34" gravity="center"/>
                <frame w="1" h="20" bg="#555555"/>
                <text id="modeTxt" text=" 手动:大豆 " textColor="#4CAF50" textSize="12sp" paddingLeft="6" paddingRight="6" h="34" gravity="center"/>
                <frame w="1" h="20" bg="#555555"/>
                <text id="ppBtn" text=" ▶ " textColor="#4CAF50" textSize="15sp" w="34" h="34" gravity="center"/>
            </horizontal>

            <vertical id="panel" bg="#EE333333" w="252" padding="7" visibility="gone">
                <horizontal w="match_parent" h="28" gravity="center_vertical" marginBottom="5">
                    <text id="btnModeAuto" text="自动挡" textColor="#FFFFFF" textSize="11sp" bg="#555555" w="0" layout_weight="1" h="26" gravity="center" marginRight="4"/>
                    <text id="btnModeManual" text="● 手动挡" textColor="#FFFFFF" textSize="11sp" bg="#4CAF50" w="0" layout_weight="1" h="26" gravity="center"/>
                </horizontal>

                <vertical id="autoSpeedBox" w="match_parent" visibility="gone">
                    <horizontal w="match_parent" h="20" gravity="center_vertical">
                        <text text="滑动变速（两挡同步）" textColor="#E0E0E0" textSize="11sp" w="0" layout_weight="1"/>
                        <text id="speedValTxt" text="100%" textColor="#FFD54F" textSize="11sp"/>
                    </horizontal>
                    <frame id="sliderTrack" w="236" h="24" marginTop="2" marginBottom="4">
                        <frame w="236" h="5" bg="#666666" layout_gravity="center_vertical"/>
                        <frame w="3" h="16" bg="#FFD54F" layout_gravity="center_vertical" marginLeft="157"/>
                        <frame id="sliderThumb" w="14" h="20" bg="#4CAF50" layout_gravity="center_vertical" marginLeft="222"/>
                    </frame>
                    <frame w="match_parent" h="1" bg="#555555" marginTop="2" marginBottom="4"/>
                </vertical>

                <vertical id="manualBox" w="match_parent" visibility="visible">
                    <text text="手动挡位" textColor="#E0E0E0" textSize="11sp" marginBottom="3"/>
                    <horizontal w="match_parent" h="26" gravity="center_vertical" marginBottom="3">
                        <text id="gearWheatBtn" text="小麦" textColor="#FFFFFF" textSize="11sp" bg="#555555" w="0" layout_weight="1" h="24" gravity="center" marginRight="3"/>
                        <text id="gearRiceBtn" text="水稻" textColor="#FFFFFF" textSize="11sp" bg="#555555" w="0" layout_weight="1" h="24" gravity="center" marginRight="3"/>
                        <text id="gearSoyBtn" text="大豆" textColor="#FFFFFF" textSize="11sp" bg="#4CAF50" w="0" layout_weight="1" h="24" gravity="center" marginRight="3"/>
                        <text id="gearCaneBtn" text="甘蔗" textColor="#FFFFFF" textSize="11sp" bg="#555555" w="0" layout_weight="1" h="24" gravity="center"/>
                    </horizontal>
                    <horizontal w="match_parent" h="26" gravity="center_vertical" marginBottom="4">
                        <text id="gearCornBtn" text="玉米" textColor="#FFFFFF" textSize="11sp" bg="#555555" w="0" layout_weight="1" h="24" gravity="center" marginRight="3"/>
                        <text id="gearPumpkinBtn" text="南瓜" textColor="#FFFFFF" textSize="11sp" bg="#555555" w="0" layout_weight="1" h="24" gravity="center" marginRight="3"/>
                        <text id="gearCornPumpkinBtn" text="玉米南瓜" textColor="#FFFFFF" textSize="10sp" bg="#555555" w="0" layout_weight="1" h="24" gravity="center" marginRight="3"/>
                        <text id="gearFertileBtn" text="良田" textColor="#FFFFFF" textSize="11sp" bg="#555555" w="0" layout_weight="1" h="24" gravity="center"/>
                    </horizontal>
                    <frame w="match_parent" h="1" bg="#555555" marginTop="2" marginBottom="4"/>
                </vertical>

                <horizontal w="match_parent" h="25" gravity="center_vertical">
                    <text text="上方田地" textColor="#E0E0E0" textSize="11sp" w="0" layout_weight="1" gravity="left|center_vertical"/>
                    <text id="upperTgl" text=" 开 " textColor="#FFFFFF" textSize="11sp" bg="#4CAF50" padding="4" gravity="center"/>
                </horizontal>
                <horizontal w="match_parent" h="25" gravity="center_vertical" marginTop="2">
                    <text text="鸡舍" textColor="#E0E0E0" textSize="11sp" w="0" layout_weight="1" gravity="left|center_vertical"/>
                    <text id="chickenTgl" text=" 开 " textColor="#FFFFFF" textSize="11sp" bg="#4CAF50" padding="4" gravity="center"/>
                </horizontal>
                <horizontal w="match_parent" h="25" gravity="center_vertical" marginTop="2">
                    <text text="马厩" textColor="#E0E0E0" textSize="11sp" w="0" layout_weight="1" gravity="left|center_vertical"/>
                    <text id="ranchTgl" text=" 开 " textColor="#FFFFFF" textSize="11sp" bg="#4CAF50" padding="4" gravity="center"/>
                </horizontal>
                <horizontal w="match_parent" h="25" gravity="center_vertical" marginTop="2">
                    <text text="自动装载" textColor="#E0E0E0" textSize="11sp" w="0" layout_weight="1" gravity="left|center_vertical"/>
                    <text id="stationLoadTgl" text=" 关 " textColor="#FFFFFF" textSize="11sp" bg="#666666" padding="4" gravity="center"/>
                </horizontal>
                <horizontal w="match_parent" h="25" gravity="center_vertical" marginTop="2">
                    <text text="偏移检测" textColor="#E0E0E0" textSize="11sp" w="0" layout_weight="1" gravity="left|center_vertical"/>
                    <text id="driftCheckTgl" text=" 关 " textColor="#FFFFFF" textSize="11sp" bg="#666666" padding="4" gravity="center"/>
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
        if (CTRL.settingsOpen) {
            forceCloseSettingsPanel();
        } else {
            CTRL.settingsOpen = true;
            syncUI();
            ctrlWin.panel.post(function () {
                ctrlWin.panel.setVisibility(0);
                syncSpeedSliderUI();
            });
        }
    });

    var ppDownTime = 0;
    var ppPressing = false;
    var ppLongPressTriggered = false;
    ctrlWin.ppBtn.setOnTouchListener(function (view, event) {
        var action = event.getAction();
        if (action === event.ACTION_DOWN) {
            ppDownTime = Date.now();
            ppPressing = true;
            ppLongPressTriggered = false;
            var thisDownTime = ppDownTime;
            threads.start(function () {
                sleep(1000);
                if (ppPressing && ppDownTime === thisDownTime && !ppLongPressTriggered) {
                    ppLongPressTriggered = true;
                    forceCloseSettingsPanel();
                    CTRL.paused = true;
                    pauseTriggered = true;
                    syncUI();
                    var confirmed = dialogs.confirm("Reset", "是否重置所有计时？");
                    if (confirmed) {
                        resetAllTimersToZero();
                        justResetAllTimers = true;
                        toastLog("已重置所有计时");
                    }
                }
            });
            return true;
        }
        if (action === event.ACTION_UP || action === event.ACTION_CANCEL) {
            ppPressing = false;
            if (!ppLongPressTriggered && action === event.ACTION_UP) {
                if (CTRL.paused) {
                    forceCloseSettingsPanel();
                    CTRL.paused = false;
                    syncUI();
                } else {
                    CTRL.paused = true;
                    pauseTriggered = true;
                    syncUI();
                    toastLog("已暂停");
                }
            }
            return true;
        }
        return true;
    });

    ctrlWin.btnModeAuto.click(function () { selectDriveMode('auto'); });
    ctrlWin.btnModeManual.click(function () { selectDriveMode('manual'); });

    ctrlWin.sliderTrack.setOnTouchListener(function (view, event) {
        var act = event.getAction();
        if (act === event.ACTION_DOWN || act === event.ACTION_MOVE || act === event.ACTION_UP) {
            var w = view.getWidth();
            if (w > 0) {
                var ratio = event.getX() / w;
                ratio = Math.max(0, Math.min(1, ratio));
                var YELLOW_TICK = 2.0 / 3.0;
                if (Math.abs(ratio - YELLOW_TICK) <= 0.035) {
                    ratio = YELLOW_TICK;
                } else if (ratio > 0.97) {
                    ratio = 1.0;
                } else if (ratio < 0.03) {
                    ratio = 0.0;
                }
                speedSliderPos = ratio;
                syncSpeedSliderUI();
                if (act === event.ACTION_UP) {
                    saveUIConfig();
                }
            }
        }
        return true;
    });

    bindGearButtonWithLongPress(ctrlWin.gearWheatBtn,       'wheat',        true);
    bindGearButtonWithLongPress(ctrlWin.gearRiceBtn,        'rice',         true);
    bindGearButtonWithLongPress(ctrlWin.gearSoyBtn,         'soy',          true);
    bindGearButtonWithLongPress(ctrlWin.gearCaneBtn,        'cane',         true);
    bindGearButtonWithLongPress(ctrlWin.gearCornBtn,        'corn',         false);
    bindGearButtonWithLongPress(ctrlWin.gearPumpkinBtn,     'pumpkin',      false);
    bindGearButtonWithLongPress(ctrlWin.gearCornPumpkinBtn, 'corn_pumpkin', false);
    bindGearButtonWithLongPress(ctrlWin.gearFertileBtn,     'fertile',      true);

    ctrlWin.upperTgl.click(function () {
        var opts = getActiveOpts(nextDriveMode);
        opts.upper = opts.upper ? 0 : 1;
        if (nextDriveMode === 'manual' && !opts.upper && nextManualGear === 'corn_pumpkin') {
            nextManualGear = 'soy';
            if (CTRL.paused) currentManualGear = 'soy';
        }
        saveUIConfig();
        syncUI();
    });

    ctrlWin.chickenTgl.click(function () {
        var opts = getActiveOpts(nextDriveMode);
        if (opts.chicken) {
            threads.start(function () {
                if (!dialogs.confirm("确定关闭鸡舍流程吗？")) return;
                opts.chicken = 0;
                lastNoChickenWheatSellTime = Date.now();
                saveUIConfig();
                syncUI();
            });
        } else {
            threads.start(function () {
                if (!chickenCalibrated) {
                    forceCloseSettingsPanel();
                    CTRL.paused = true;
                    syncUI();
                    sleep(600);
                    CONFIG.eggSlotInWarehouse = calibrateAndVerify("打开仓库，把红十字拖到鸡蛋图标上，再点\"确定这里\"");
                    CONFIG.eggSellBtn = calibrateAndVerify("点一下鸡蛋弹出详情，把红十字拖到\"出售\"按钮上，再点\"确定这里\"");
                    chickenCalibrated = true;
                    calibStorage.put('eggSlot', CONFIG.eggSlotInWarehouse);
                    calibStorage.put('eggBtn', CONFIG.eggSellBtn);
                    calibStorage.put('chickenCalibrated', true);
                }
                opts.chicken = 1;
                saveUIConfig();
                syncUI();
            });
        }
    });

    ctrlWin.ranchTgl.click(function () {
        var opts = getActiveOpts(nextDriveMode);
        if (opts.ranch) {
            threads.start(function () {
                if (!dialogs.confirm("确定关闭马厩流程吗？")) return;
                opts.ranch = 0;
                saveUIConfig();
                syncUI();
            });
        } else {
            threads.start(function () {
                if (!ranchCalibrated) {
                    forceCloseSettingsPanel();
                    CTRL.paused = true;
                    syncUI();
                    sleep(600);
                    CONFIG.milkSlotInWarehouse = calibrateAndVerify("打开仓库，把红十字拖到马奶图标上，再点\"确定这里\"");
                    CONFIG.milkSellBtn = calibrateAndVerify("点一下马奶弹出详情，把红十字拖到\"出售\"按钮上，再点\"确定这里\"");
                    ranchCalibrated = true;
                    calibStorage.put('milkSlot', CONFIG.milkSlotInWarehouse);
                    calibStorage.put('milkBtn', CONFIG.milkSellBtn);
                    calibStorage.put('ranchCalibrated', true);
                }
                opts.ranch = 1;
                saveUIConfig();
                syncUI();
            });
        }
    });

    ctrlWin.stationLoadTgl.click(function () {
        var opts = getActiveOpts(nextDriveMode);
        opts.stationLoad = opts.stationLoad ? 0 : 1;
        saveUIConfig();
        syncUI();
    });

    ctrlWin.driftCheckTgl.click(function () {
        var opts = getActiveOpts(nextDriveMode);
        opts.driftCheck = opts.driftCheck ? 0 : 1;
        saveUIConfig();
        syncUI();
    });

    syncUI();
}

// ================= 启动流程 =================
try {
    var __testWin = floaty.window(<text text="."/>);
    __testWin.close();
} catch (e) {
    toastLog("没有悬浮窗权限，请开启后重试");
    releaseLock(); exit();
}
waitForLandscape();
setScreenMetrics(2412, 1080);
toastLog("即将请求截屏权限，请点击允许");
var checkPermission = false;
try { checkPermission = requestScreenCapture(); } catch (e) {}
if (!checkPermission) {
    toastLog("你取消了截屏权限，脚本已终止。");
    releaseLock(); exit();
}
sleep(800);
if (chickenCalibrated || ranchCalibrated || fertileCalibrated) {
    var skipCalib = dialogs.confirm(
        "检测到已有校准数据",
        "是否直接跳过校准开始挂机？\n【确定】直接使用历史坐标\n【取消】重新校准全部坐标"
    );
    if (!skipCalib) {
        calibStorage.clear();
        chickenCalibrated = false;
        ranchCalibrated = false;
        fertileCalibrated = false;
        sleep(500);
    }
}
if ((AUTO_OPTS.chicken || MANUAL_OPTS.chicken) && !chickenCalibrated) {
    CONFIG.eggSlotInWarehouse = calibrateAndVerify("打开仓库，把红十字拖到鸡蛋图标上，再点\"确定这里\"");
    CONFIG.eggSellBtn = calibrateAndVerify("点一下鸡蛋弹出详情，把红十字拖到\"出售\"按钮上，再点\"确定这里\"");
    chickenCalibrated = true;
    calibStorage.put('eggSlot', CONFIG.eggSlotInWarehouse);
    calibStorage.put('eggBtn', CONFIG.eggSellBtn);
    calibStorage.put('chickenCalibrated', true);
}
if ((AUTO_OPTS.ranch || MANUAL_OPTS.ranch) && !ranchCalibrated) {
    CONFIG.milkSlotInWarehouse = calibrateAndVerify("打开仓库，把红十字拖到马奶图标上，再点\"确定这里\"");
    CONFIG.milkSellBtn = calibrateAndVerify("点一下马奶弹出详情，把红十字拖到\"出售\"按钮上，再点\"确定这里\"");
    ranchCalibrated = true;
    calibStorage.put('milkSlot', CONFIG.milkSlotInWarehouse);
    calibStorage.put('milkBtn', CONFIG.milkSellBtn);
    calibStorage.put('ranchCalibrated', true);
}
if (!fertileCalibrated) {
    FERTILE.SAFE_CLOSE = calibrateAndVerify("进入良田界面，把红十字拖到良田空白位置（用于消除弹窗），再点\"确定这里\"");
    fertileCalibrated = true;
    calibStorage.put('fertileSafeClose', FERTILE.SAFE_CLOSE);
    calibStorage.put('fertileCalibrated', true);
}

createControlPanel();
toastLog("脚本已就绪！");

// ================= 主循环 =================
var loopCount = 0;
while (true) {
    try {
        renewLock();
        if (CTRL.paused) {
            handlePauseAndResume();
        }
        setActionInProgress(true);

        // ===== 分支1：手动挡 - 良田独立挂机 =====
        if (currentDriveMode === 'manual' && currentManualGear === 'fertile') {
            runPureFertileStep();
            applyPendingModeAndGearSwitch();
            continue;
        }

        if (!referencePatch) {
            captureReferencePatch();
        }

        loopCount++;
        // 若从良田等挡位切回玉米南瓜/普通挡位时，主田作物仍在读秒期（尚未成熟），自动衔接进入等待收割分支，绝不重复点中间地去走种植
        if (!skipToHarvestOnce && plantDone && mainFieldReadyAt > Date.now()) {
            applyPendingModeAndGearSwitch();
            skipToHarvestOnce = true;
            skipWaitOnce = false;
            pendingMenuAlreadyOpen = false;
        }
        if (skipToHarvestOnce) {
            skipToHarvestOnce = false;
            var menuOpenH = pendingMenuAlreadyOpen;
            pendingMenuAlreadyOpen = false;
            var forceNow = skipWaitOnce;
            skipWaitOnce = false;
            var isCP = (currentDriveMode === 'manual' && currentManualGear === 'corn_pumpkin');
            if (menuOpenH) {
                beginAction();
                harvestAll(true);
            } else if (forceNow) {
                beginAction();
                harvestAll(false);
            } else {
                waitReadyAndHarvest(false, isCP);
            }
            // 若是手动点【收割】(forceNow)则上方田地已在handlePauseAndResume中对齐为立即收割；正常到点时保留upperFieldReadyAt由runUpperFieldFlow自动补足剩余秒数
            if (currentDriveMode === 'auto') {
                advanceAutoStepAfterHarvest();
            }
            applyPendingModeAndGearSwitch();
        } else {
            applyPendingModeAndGearSwitch();
            DriftGuard.reset();

            roundWarehouseAlreadySold = false;

            // ===== 分支2：手动挡 - 玉米南瓜（下方1次南瓜2h + 上方2次玉米各1h，收进均不卖） =====
            if (currentDriveMode === 'manual' && currentManualGear === 'corn_pumpkin') {
                cornPumpkinSecondCornDone = false;
                var menuOpenCP = pendingMenuAlreadyOpen;
                pendingMenuAlreadyOpen = false;

                plantAll('pumpkin', menuOpenCP);
                runFertileAndUpperFlow('corn', false);

                if (!roundWarehouseAlreadySold) {
                    if (extraOverflowWheatSells > 0) {
                        runRoundWarehouseSells(null, 0, '爆仓补种小麦卖货');
                    } else {
                        flushEggMilkIfDue();
                    }
                }
                clickSafeClose();
                pausableSleep(500);

                if (stationGoodsPending) collectStationGoods();

                var midResCP = DriftGuard.midFlowRecheck();
                if (midResCP === 'drift') {
                    var midDetCP = recoverFromFreeze('midflow确认偏移', 'drift');
                    throw new RecoveredCycleSignal(midDetCP.mode, midDetCP.menuAlreadyOpen);
                } else if (midResCP === 'warehouseFull') {
                    handleWarehouseFullUnified('midflow_corn_pumpkin', false);
                }

                waitReadyAndHarvest(false, true);

                if (stationGoodsPending) collectStationGoods();
                applyPendingModeAndGearSwitch();
                continue;
            }

            // ===== 分支3：手动挡（小麦/水稻/大豆/甘蔗/玉米/南瓜） 与 自动挡 =====
            var autoCfg = (currentDriveMode === 'auto') ? getCurrentAutoStepConfig() : null;
            if (currentDriveMode === 'auto') {
                currentCrop = autoCfg.crop;
            } else {
                currentCrop = CROPS[currentManualGear] ? currentManualGear : 'soy';
            }

            var menuAlreadyOpenP = pendingMenuAlreadyOpen;
            pendingMenuAlreadyOpen = false;

            // 1. 主田种植当前作物
            plantAll(currentCrop, menuAlreadyOpenP);

            // 2. 紧接着去良田（成熟则顺便0.2s收种，未熟仅借道）→ 去上方田地收种同种作物 → 回中
            runFertileAndUpperFlow(currentCrop, false);

            // 3. 回中后去仓库卖货（若刚才在良田或上方田地已触发爆仓变卖，则本轮不重复卖；若有主田爆仓补种小麦遗留的2次小麦，则一并多卖2次）
            if (!roundWarehouseAlreadySold) {
                if (currentDriveMode === 'manual') {
                    if (currentCrop === 'corn' || currentCrop === 'pumpkin') {
                        if (extraOverflowWheatSells > 0) {
                            runRoundWarehouseSells(null, 0, '爆仓补种小麦卖货');
                        } else {
                            flushEggMilkIfDue();
                        }
                    } else {
                        runRoundWarehouseSells(currentCrop, 2, '手动挡卖货');
                    }
                } else {
                    runRoundWarehouseSells(autoPendingSellCrop, autoPendingSellTimes, '自动挡卖货');
                    autoPendingSellCrop = null;
                    autoPendingSellTimes = 0;
                }
            } else {
                autoPendingSellCrop = null;
                autoPendingSellTimes = 0;
            }
            clickSafeClose();
            pausableSleep(500);

            if (pauseRanchAfterRiceOverflow && currentCrop !== 'rice' && currentCrop !== 'soy') {
                pauseRanchAfterRiceOverflow = false;
                if (checkAndRunRanchTasks() !== 'none') {
                    clickSafeClose();
                    pausableSleep(500);
                    flushEggMilkIfDue();
                }
            }

            if (stationGoodsPending) collectStationGoods();

            var midResult = DriftGuard.midFlowRecheck();
            if (midResult === 'drift') {
                var midDetection = recoverFromFreeze('midflow确认偏移', 'drift');
                throw new RecoveredCycleSignal(midDetection.mode, midDetection.menuAlreadyOpen);
            } else if (midResult === 'warehouseFull') {
                handleWarehouseFullUnified('midflow', false);
            }

            // 4. 等待成熟并收割主田
            waitReadyAndHarvest(false, false);

            // 5. 本轮收割完成，推进自动挡步骤或无缝切换预约挡位
            if (currentDriveMode === 'auto') {
                advanceAutoStepAfterHarvest();
            }
            applyPendingModeAndGearSwitch();
        }
    } catch (e) {
        bubbleFlowActive = false;
        if (e instanceof PauseSignal) {
            CTRL.paused = true;
            syncUI();
        } else if (e instanceof RestartCycleSignal) {
            skipToHarvestOnce = false;
            skipWaitOnce = false;
            pendingMenuAlreadyOpen = false;
        } else if (e instanceof RecoveredCycleSignal) {
            skipToHarvestOnce = (e.mode === 'harvest' || e.mode === 'wait');
            skipWaitOnce = (e.mode === 'harvest');
            pendingMenuAlreadyOpen = e.menuAlreadyOpen;
            bubbleDetectSuspended = inOverflowWheatRescue ? true : false;
        } else {
            toastLog("主循环异常：" + (e && e.message ? e.message : e));
            sleep(3000);
        }
    }
}
