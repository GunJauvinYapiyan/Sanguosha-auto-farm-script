//Auto火力种田王 - 日常多功能辅助脚本（良田独立挂机 + 小麦/水稻/大豆/玉米/南瓜 手动单次种收）

auto.waitFor();
floaty.closeAll();

setScreenMetrics(2412, 1080);

// ================= 配置参数 =================
var CONFIG = {
    CENTER: [1200, 540],       // 中心土地坐标
    WHEAT: [740, 910],         // 小麦种子坐标
    RICE: [935, 900],          // 水稻种子坐标
    SOY: [1111, 900],          // 大豆种子坐标
    CORN: [1480, 910],         // 玉米种子坐标
    PUMPKIN: [1740, 910],      // 南瓜种子坐标
    SICKLE: [1220, 856],       // 镰刀图标坐标
    WAIT_SEC: 121,             // 良田等待时间121秒
    LEFT_X: 170,
    RIGHT_X: 2250,
    LOOP_COUNT: 3,
    holdMs: 400
};

var PARAMS = {
    wheat:   { topY: 151, bottomY: 926, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.WHEAT,   loop1Ms: 36, loop2Ms: 17, loop3Ms: 15 },
    rice:    { topY: 151, bottomY: 926, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.RICE,    loop1Ms: 36, loop2Ms: 21, loop3Ms: 20 },
    soy:     { topY: 151, bottomY: 925, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.SOY,     loop1Ms: 36, loop2Ms: 21, loop3Ms: 20 },
    corn:    { topY: 151, bottomY: 925, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.CORN,    loop1Ms: 36, loop2Ms: 18, loop3Ms: 14 },
    pumpkin: { topY: 151, bottomY: 926, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.PUMPKIN, loop1Ms: 36, loop2Ms: 18, loop3Ms: 14 },
    sickle:  { topY: 151, bottomY: 926, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: CONFIG.SICKLE,  loop1Ms: 36, loop2Ms: 18, loop3Ms: 14 }
};

var STATE = {
    paused: true,
    settingsOpen: false,
    mode: 'fertile',           // 'fertile' | 'wheat' | 'rice' | 'soy' | 'corn' | 'pumpkin'
    pendingAction: null        // 'plant' | 'harvest' | null
};

// ================= 权限校验 =================
try {
    var __testWin = floaty.window(<text text="."/>);
    __testWin.close();
} catch (e) {
    toastLog("未获取悬浮窗权限，请到系统设置中开启「显示在其他应用上层/悬浮窗」后重试！");
    exit();
}

// ================= 工具与轨迹函数 =================
function pausableSleep(ms) {
    var remain = ms;
    while (remain > 0) {
        if (STATE.paused) throw "PAUSED";
        var t = Math.min(200, remain);
        sleep(t);
        remain -= t;
    }
}

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

// 良田极简拖拽：选中 -> 拖到中心 -> 脱手
function doDragAction(iconCoord) {
    var ct = CONFIG.CENTER;
    var pts = [];
    for (var i = 0; i < 7; i++) pts.push(iconCoord);
    pts = pts.concat(generateLine(iconCoord, ct, 10));
    for (var j = 0; j < 4; j++) pts.push(ct);

    var duration = Math.max(pts.length * 25, 500);
    gesture.apply(null, [duration].concat(pts));
}

// 通用作物转三圈拖拽
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
    var warmupCircle = circlePoints(CONFIG.CENTER, 25, 10);
    points = points.concat(warmupCircle, warmupCircle, warmupCircle);
    for (var r2 = 0; r2 < 4; r2++) points.push(CONFIG.CENTER);
    var l1 = CONFIG.LEFT_X, r1 = CONFIG.RIGHT_X, t1 = p.topY, b1 = p.bottomY;
    var TL = [l1, t1], TR = [r1, t1], BR = [r1, b1], BL = [l1, b1];
    points = points.concat(generateLine(CONFIG.CENTER, TL, scaleSteps(BASE_STEPS.entry, p.loop1Ms)));
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
    points = points.concat(generateLine(lastCorner, p.hook1, 15));
    points = points.concat(generateLine(p.hook1, p.hook2, 15));
    points = points.concat(generateLine(p.hook2, CONFIG.CENTER, 15));
    var duration = Math.max(points.length * 25, 500);
    gesture.apply(null, [duration].concat(points));
}

// ================= 悬浮窗及换挡交互 =================
var MODE_LABELS = {
    fertile: '良田',
    wheat:   '小麦',
    rice:    '水稻',
    soy:     '大豆',
    corn:    '玉米',
    pumpkin: '南瓜'
};

function modeLabel(m) {
    return MODE_LABELS[m] || '良田';
}

var ctrlWin = floaty.window(
    <vertical id="root" w="auto" h="auto">
        <horizontal id="bar" bg="#CC333333" w="auto" h="36" gravity="center_vertical" padding="2">
            <text id="drag" text=" ≡ " textColor="#999999" textSize="15sp" w="30" h="36" gravity="center"/>
            <frame w="1" h="22" bg="#555555"/>
            <text id="setBtn" text=" ⚙ " textColor="#CCCCCC" textSize="16sp" w="36" h="36" gravity="center"/>
            <frame w="1" h="22" bg="#555555"/>
            <text id="modeTxt" text=" 良田 " textColor="#FFD54F" textSize="12sp" paddingLeft="6" paddingRight="6" h="36" gravity="center"/>
            <frame w="1" h="22" bg="#555555"/>
            <text id="ppBtn" text=" ▶ " textColor="#4CAF50" textSize="16sp" w="36" h="36" gravity="center"/>
        </horizontal>
        <vertical id="panel" bg="#EE333333" w="210" padding="8" visibility="gone">
            <horizontal w="match_parent" h="30" gravity="center_vertical">
                <text id="btnFertile" text="良田挂机" textColor="#FFFFFF" textSize="11sp" bg="#4CAF50" layout_weight="1" h="28" gravity="center" marginRight="4"/>
                <text id="btnWheat" text="小麦" textColor="#FFFFFF" textSize="11sp" bg="#666666" layout_weight="1" h="28" gravity="center"/>
            </horizontal>
            <horizontal w="match_parent" h="30" gravity="center_vertical" marginTop="4">
                <text id="btnRice" text="水稻" textColor="#FFFFFF" textSize="11sp" bg="#666666" layout_weight="1" h="28" gravity="center" marginRight="4"/>
                <text id="btnSoy" text="大豆" textColor="#FFFFFF" textSize="11sp" bg="#666666" layout_weight="1" h="28" gravity="center"/>
            </horizontal>
            <horizontal w="match_parent" h="30" gravity="center_vertical" marginTop="4">
                <text id="btnCorn" text="玉米" textColor="#FFFFFF" textSize="11sp" bg="#666666" layout_weight="1" h="28" gravity="center" marginRight="4"/>
                <text id="btnPumpkin" text="南瓜" textColor="#FFFFFF" textSize="11sp" bg="#666666" layout_weight="1" h="28" gravity="center"/>
            </horizontal>
        </vertical>
    </vertical>
);
ctrlWin.setPosition(100, 100);

function syncUI() {
    var list = [
        { key: 'fertile', view: ctrlWin.btnFertile, label: '良田挂机' },
        { key: 'wheat',   view: ctrlWin.btnWheat,   label: '小麦' },
        { key: 'rice',    view: ctrlWin.btnRice,    label: '水稻' },
        { key: 'soy',     view: ctrlWin.btnSoy,     label: '大豆' },
        { key: 'corn',    view: ctrlWin.btnCorn,    label: '玉米' },
        { key: 'pumpkin', view: ctrlWin.btnPumpkin, label: '南瓜' }
    ];
    for (var i = 0; i < list.length; i++) {
        (function (item) {
            var active = (STATE.mode === item.key);
            item.view.post(function () {
                item.view.setText(item.label + (active ? " ✔" : ""));
                try { item.view.setBackgroundColor(colors.parseColor(active ? "#4CAF50" : "#666666")); } catch (e) {}
            });
        })(list[i]);
    }
    ctrlWin.modeTxt.post(function () {
        ctrlWin.modeTxt.setText(" " + modeLabel(STATE.mode) + " ");
    });
    ctrlWin.setBtn.post(function () {
        try { ctrlWin.setBtn.setTextColor(colors.parseColor(STATE.paused ? "#CCCCCC" : "#555555")); } catch (e) {}
    });
    ctrlWin.ppBtn.post(function () {
        ctrlWin.ppBtn.setText(STATE.paused ? " ▶ " : " ⏸ ");
        try { ctrlWin.ppBtn.setTextColor(colors.parseColor(STATE.paused ? "#4CAF50" : "#E53935")); } catch (e) {}
    });
}

function closeSettingsPanel() {
    STATE.settingsOpen = false;
    ctrlWin.panel.post(function () { ctrlWin.panel.setVisibility(8); });
}

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

// 只有暂停后才能打开或修改设置
ctrlWin.setBtn.click(function () {
    if (!STATE.paused) {
        toastLog("请先点 ⏸ 暂停后再修改设置！");
        return;
    }
    if (STATE.settingsOpen) {
        closeSettingsPanel();
    } else {
        STATE.settingsOpen = true;
        syncUI();
        ctrlWin.panel.post(function () { ctrlWin.panel.setVisibility(0); });
    }
});

function switchGear(targetMode) {
    if (!STATE.paused) {
        toastLog("请先点暂停后再切换挡位！");
        return;
    }
    STATE.mode = targetMode;
    syncUI();
    closeSettingsPanel();
    toastLog("已切换挡位：" + modeLabel(targetMode));
}

ctrlWin.btnFertile.click(function () { switchGear('fertile'); });
ctrlWin.btnWheat.click(function ()   { switchGear('wheat'); });
ctrlWin.btnRice.click(function ()    { switchGear('rice'); });
ctrlWin.btnSoy.click(function ()     { switchGear('soy'); });
ctrlWin.btnCorn.click(function ()    { switchGear('corn'); });
ctrlWin.btnPumpkin.click(function () { switchGear('pumpkin'); });

ctrlWin.ppBtn.click(function () {
    if (STATE.paused) {
        closeSettingsPanel();
        if (STATE.mode === 'fertile') {
            threads.start(function () {
                var ok = dialogs.confirm("良田管理", "是否开始自动种植进程？");
                if (ok) {
                    STATE.paused = false;
                    syncUI();
                    toastLog("开始执行种植进程...");
                }
            });
        } else {
            threads.start(function () {
                var cname = modeLabel(STATE.mode);
                var actionClicked = null;
                var dlg = dialogs.build({
                    title: cname + "模式",
                    content: "请确保已在游戏里选中中间土地，选择要执行的动作：",
                    positive: "种植",
                    negative: "收割",
                    neutral: "取消"
                }).on("any", function (action) {
                    actionClicked = action;
                });
                dlg.show();
                while (actionClicked == null) sleep(100);
                if (actionClicked !== "positive" && actionClicked !== "negative") return;
                STATE.pendingAction = (actionClicked === "positive") ? "plant" : "harvest";
                STATE.paused = false;
                syncUI();
            });
        }
    } else {
        STATE.paused = true;
        STATE.pendingAction = null;
        syncUI();
        toastLog("已暂停！");
    }
});

syncUI();
toastLog("日常多挡辅助脚本已就绪：点 ⚙ 可换挡，点 ▶ 开始");

// ================= 主工作循环 =================
while (true) {
    try {
        if (STATE.paused) {
            sleep(200);
            continue;
        }

        if (STATE.mode === 'fertile') {
            // ===== 良田专属独立挂机流程 =====
            // 1. 中间土地连点三下
            for (var i = 0; i < 3; i++) {
                click(CONFIG.CENTER[0], CONFIG.CENTER[1]);
                sleep(80);
            }
            pausableSleep(150);

            // 2. 小麦丢上去直接脱手
            doDragAction(CONFIG.WHEAT);
            pausableSleep(400);

            // 3. 马上选中间土地定住位置，死死锁住镜头防止滑动
            click(CONFIG.CENTER[0], CONFIG.CENTER[1]);

            // 4. 安静等待121秒
            toastLog("已定住位置，安静等待" + CONFIG.WAIT_SEC + "秒...");
            var readyAt = Date.now() + CONFIG.WAIT_SEC * 1000;
            while (Date.now() < readyAt) {
                pausableSleep(1000);
            }
        } else {
            // ===== 小麦 / 水稻 / 大豆 / 玉米 / 南瓜 单次转三圈流程 =====
            var act = STATE.pendingAction;
            STATE.pendingAction = null;
            if (act === 'plant' || act === 'harvest') {
                pausableSleep(500); // 留出弹窗收起时间
                var loopKey = (act === 'harvest') ? 'sickle' : STATE.mode;
                toastLog("开始" + (act === 'harvest' ? "收割" : ("播种" + modeLabel(STATE.mode))) + "...");
                dragFarmLoop(loopKey);
                toastLog((act === 'harvest' ? "收割" : (modeLabel(STATE.mode) + "播种")) + "完成！");
            }
            // 单次动作完成后自动切回暂停状态，等待下一次点击
            STATE.paused = true;
            syncUI();
        }
    } catch (e) {
        if (e === "PAUSED") {
            log("操作被用户暂停打断。");
        } else {
            console.error("执行发生异常: " + e);
            sleep(1000);
        }
    }
}
