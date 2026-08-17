// ================= 跑圈测试专属脚本 =================

auto.waitFor();
setScreenMetrics(2412, 1080);

try {
    var __t = floaty.window(<text text="."/>);
    __t.close();
} catch (e) {
    toastLog("没有悬浮窗权限，去系统设置里开启后重新运行");
    exit();
}

function waitForLandscape() {
    if (device.width < device.height) {
        toastLog("请切回游戏，保持横屏，稍等会自动继续");
        while (device.width < device.height) {
            sleep(500);
        }
        sleep(1000);
    }
}
waitForLandscape();

var LEFT_X = 170, RIGHT_X = 2250;
var LOOP_COUNT = 3;
var holdMs = 400;

var BASE_STEPS = {
    entry: 15,
    l1_top: 40, l1_right: 20, l1_bottom: 40, l1_left: 20,
    l2_enter: 10, l2_top: 40, l2_right: 20, l2_bottom: 40,
    l3_close: 18, l3_enter: 8, l3_top: 22, l3_right: 10, l3_bottom: 22
};

// 4组完整参数（小麦、水稻、收小麦、收水稻）
var cfg = {
    wheat:      { topY: 151, bottomY: 924, shrink: 90, shrink2: 55, icon: [740, 910],  loop1Ms: 19, loop2Ms: 17, loop3Ms: 15 },
    rice:       { topY: 153, bottomY: 924, shrink: 90, shrink2: 55, icon: [935, 900],  loop1Ms: 22, loop2Ms: 21, loop3Ms: 20 },
    sickle:     { topY: 153, bottomY: 926, shrink: 90, shrink2: 55, icon: [1220, 856], loop1Ms: 18, loop2Ms: 18, loop3Ms: 14 },
    riceSickle: { topY: 153, bottomY: 924, shrink: 90, shrink2: 55, icon: [1220, 856], loop1Ms: 22, loop2Ms: 21, loop3Ms: 20 }
};

var modes = ["wheat", "rice", "sickle", "riceSickle"];
var modeNames = ["种小麦", "种水稻", "收小麦", "收水稻"];
var modeIndex = 0;
var currentMode = modes[modeIndex];

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

function buildPoints(key) {
    var p = cfg[key];
    var points = [];
    var holdReps = Math.max(6, Math.round(holdMs / 60));
    
    // 1. 在图标位置长按起手
    for (var r = 0; r < holdReps; r++) points.push(p.icon);

    // 2. 避开中心：往左上方偏开100像素作为安全过渡点
    var safePoint = [p.icon[0] - 100, p.icon[1] - 100];
    
    // 【核心平稳起步】：强制用10步拉到过渡点，用你原本最稳的逻辑，彻底告别甩镜头
    points = points.concat(generateLine(p.icon, safePoint, 10));

    var l1 = LEFT_X, r1 = RIGHT_X, t1 = p.topY, b1 = p.bottomY;
    var TL = [l1, t1], TR = [r1, t1], BR = [r1, b1], BL = [l1, b1];

    // 3. 从过渡点直奔左上角
    points = points.concat(generateLine(safePoint, TL, scaleSteps(BASE_STEPS.entry, p.loop1Ms)));

    // 4. 跑一圈
    points = points.concat(generateLine(TL, TR, scaleSteps(BASE_STEPS.l1_top, p.loop1Ms)));
    points = points.concat(generateLine(TR, BR, scaleSteps(BASE_STEPS.l1_right, p.loop1Ms)));
    points = points.concat(generateLine(BR, BL, scaleSteps(BASE_STEPS.l1_bottom, p.loop1Ms)));
    points = points.concat(generateLine(BL, TL, scaleSteps(BASE_STEPS.l1_left, p.loop1Ms)));

    // 5. 跑二圈
    var l2 = l1 + p.shrink, r2 = r1 - p.shrink, t2 = t1 + p.shrink, b2 = b1 - p.shrink;
    var TL2 = [l2, t2], TR2 = [r2, t2], BR2 = [r2, b2], BL2 = [l2, b2];
    var l2TopSteps = scaleSteps(BASE_STEPS.l2_top, p.loop2Ms);
    var l2TopDist = dist(TL2, TR2);
    points = points.concat(generateLine(TL, TL2, matchSteps(TL, TL2, l2TopSteps, l2TopDist))); 
    points = points.concat(generateLine(TL2, TR2, l2TopSteps));
    points = points.concat(generateLine(TR2, BR2, scaleSteps(BASE_STEPS.l2_right, p.loop2Ms)));
    points = points.concat(generateLine(BR2, BL2, scaleSteps(BASE_STEPS.l2_bottom, p.loop2Ms)));

    var lastCorner = BL2;
    if (LOOP_COUNT >= 3) {
        // 6. 跑三圈
        points = points.concat(generateLine(BL2, TL2, scaleSteps(BASE_STEPS.l3_close, p.loop2Ms))); 
        var l3 = l2 + p.shrink2, r3 = r2 - p.shrink2, t3 = t2 + p.shrink2, b3 = b2 - p.shrink2;
        var TL3 = [l3, t3], TR3 = [r3, t3], BR3 = [r3, b3], BL3 = [l3, b3];
        var l3TopSteps = scaleSteps(BASE_STEPS.l3_top, p.loop3Ms);
        var l3TopDist = dist(TL3, TR3);
        points = points.concat(generateLine(TL2, TL3, matchSteps(TL2, TL3, l3TopSteps, l3TopDist))); 
        points = points.concat(generateLine(TL3, TR3, l3TopSteps));
        points = points.concat(generateLine(TR3, BR3, scaleSteps(BASE_STEPS.l3_right, p.loop3Ms)));
        points = points.concat(generateLine(BR3, BL3, scaleSteps(BASE_STEPS.l3_bottom, p.loop3Ms)));
        lastCorner = BL3;
    }

    // 7. 直接在这里收工，绝不回中心！
    return points;
}

function runAction(key) {
    var points = buildPoints(key);
    var duration = Math.max(points.length * 25, 500);
    var t0 = Date.now();
    gesture.apply(null, [duration].concat(points));
    return Date.now() - t0;
}

// ================= 悬浮面板：4档模式切换 ==========    threads.start(function () {
        var ms = runAction(mode);
        panel.timeText.setText("耗时：" + ms + " ms");
    });
});

panel.closeBtn.click(function () {
    panel.close();
    exit();
});

toastLog("面板在左侧，点顶部按钮切换种植/收割，同一组控件复用");

while (true) {
    sleep(1000);
}
