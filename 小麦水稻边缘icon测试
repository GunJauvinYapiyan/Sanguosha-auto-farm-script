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

var CENTER_TILE = [1200, 540];
var LEFT_X = 170, RIGHT_X = 2250;
var LOOP_COUNT = 3;
var holdMs = 400;

var BASE_STEPS = {
    entry: 15,
    l1_top: 40, l1_right: 20, l1_bottom: 40, l1_left: 20,
    l2_enter: 10, l2_top: 40, l2_right: 20, l2_bottom: 40,
    l3_close: 18, l3_enter: 8, l3_top: 22, l3_right: 10, l3_bottom: 22
};

var cfg = {
    wheat:  { topY: 150, bottomY: 925, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: [740, 910], loop1Ms: 25, loop2Ms: 25, loop3Ms: 25 },
    sickle: { topY: 154, bottomY: 925, shrink: 90, shrink2: 55, hook1: [241, 575], hook2: [668, 815], icon: [1220, 856], loop1Ms: 25, loop2Ms: 25, loop3Ms: 25 }
};

var currentMode = "wheat"; // "wheat" 或 "sickle"，切换按钮控制

function scaleSteps(base, ms) {
    return Math.max(2, Math.round(base * ms / 25));
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
        var a = (2 * Math.PI * k) / count;
        pts.push([Math.round(center[0] + radius * Math.cos(a)), Math.round(center[1] + radius * Math.sin(a))]);
    }
    return pts;
}

function buildPoints(key) {
    var p = cfg[key];
    var points = [];
    var holdReps = Math.max(6, Math.round(holdMs / 60));
    for (var r = 0; r < holdReps; r++) points.push(p.icon);
    var circle = circlePoints(CENTER_TILE, 25, 10);
    points = points.concat(circle, circle, circle);
    for (var r2 = 0; r2 < 4; r2++) points.push(CENTER_TILE);

    var l1 = LEFT_X, r1 = RIGHT_X, t1 = p.topY, b1 = p.bottomY;
    var TL = [l1, t1], TR = [r1, t1], BR = [r1, b1], BL = [l1, b1];

    points = points.concat(generateLine(CENTER_TILE, TL, scaleSteps(BASE_STEPS.entry, p.loop1Ms)));
    points = points.concat(generateLine(TL, TR, scaleSteps(BASE_STEPS.l1_top, p.loop1Ms)));
    points = points.concat(generateLine(TR, BR, scaleSteps(BASE_STEPS.l1_right, p.loop1Ms)));
    points = points.concat(generateLine(BR, BL, scaleSteps(BASE_STEPS.l1_bottom, p.loop1Ms)));
    points = points.concat(generateLine(BL, TL, scaleSteps(BASE_STEPS.l1_left, p.loop1Ms)));

    var l2 = l1 + p.shrink, r2 = r1 - p.shrink, t2 = t1 + p.shrink, b2 = b1 - p.shrink;
    var TL2 = [l2, t2], TR2 = [r2, t2], BR2 = [r2, b2], BL2 = [l2, b2];
    points = points.concat(generateLine(TL, TL2, scaleSteps(BASE_STEPS.l2_enter, p.loop2Ms)));
    points = points.concat(generateLine(TL2, TR2, scaleSteps(BASE_STEPS.l2_top, p.loop2Ms)));
    points = points.concat(generateLine(TR2, BR2, scaleSteps(BASE_STEPS.l2_right, p.loop2Ms)));
    points = points.concat(generateLine(BR2, BL2, scaleSteps(BASE_STEPS.l2_bottom, p.loop2Ms)));

    var lastCorner = BL2;
    if (LOOP_COUNT >= 3) {
        points = points.concat(generateLine(BL2, TL2, scaleSteps(BASE_STEPS.l3_close, p.loop3Ms)));
        var l3 = l2 + p.shrink2, r3 = r2 - p.shrink2, t3 = t2 + p.shrink2, b3 = b2 - p.shrink2;
        var TL3 = [l3, t3], TR3 = [r3, t3], BR3 = [r3, b3], BL3 = [l3, b3];
        points = points.concat(generateLine(TL2, TL3, scaleSteps(BASE_STEPS.l3_enter, p.loop3Ms)));
        points = points.concat(generateLine(TL3, TR3, scaleSteps(BASE_STEPS.l3_top, p.loop3Ms)));
        points = points.concat(generateLine(TR3, BR3, scaleSteps(BASE_STEPS.l3_right, p.loop3Ms)));
        points = points.concat(generateLine(BR3, BL3, scaleSteps(BASE_STEPS.l3_bottom, p.loop3Ms)));
        lastCorner = BL3;
    }

    points = points.concat(generateLine(lastCorner, p.hook1, 15));
    points = points.concat(generateLine(p.hook1, p.hook2, 15));
    points = points.concat(generateLine(p.hook2, CENTER_TILE, 15));
    return points;
}

function runAction(key) {
    var points = buildPoints(key);
    var duration = Math.max(points.length * 25, 500);
    var t0 = Date.now();
    gesture.apply(null, [duration].concat(points));
    return Date.now() - t0;
}

// ================= 悬浮面板：单组控件 + 模式切换 =================
var panel = floaty.window(
    <frame id="root" bg="#DD222222">
        <vertical padding="8">
            <text id="dragHandle" text="≡ 按住这里拖动面板 ≡" textColor="#ffdd00" textSize="13sp" bg="#33ffffff" padding="6" gravity="center"/>

            <button id="modeBtn" text="当前：种植 (点击切到收割)" textSize="13sp" h="55" marginTop="6"/>

            <horizontal gravity="center_vertical" marginTop="4">
                <text id="topYLabel" text="上边缘: 150" textColor="#fff" textSize="12sp" w="150"/>
                <button id="topYMinus" text="-" w="50" h="50" textSize="13sp"/>
                <button id="topYPlus" text="+" w="50" h="50" textSize="13sp"/>
            </horizontal>
            <horizontal gravity="center_vertical">
                <text id="bottomYLabel" text="下边缘: 925" textColor="#fff" textSize="12sp" w="150"/>
                <button id="bottomYMinus" text="-" w="50" h="50" textSize="13sp"/>
                <button id="bottomYPlus" text="+" w="50" h="50" textSize="13sp"/>
            </horizontal>
            <horizontal gravity="center_vertical">
                <text id="l1Label" text="一圈ms: 25" textColor="#fff" textSize="12sp" w="150"/>
                <button id="l1Minus" text="-" w="50" h="50" textSize="13sp"/>
                <button id="l1Plus" text="+" w="50" h="50" textSize="13sp"/>
            </horizontal>
            <horizontal gravity="center_vertical">
                <text id="l2Label" text="二圈ms: 25" textColor="#fff" textSize="12sp" w="150"/>
                <button id="l2Minus" text="-" w="50" h="50" textSize="13sp"/>
                <button id="l2Plus" text="+" w="50" h="50" textSize="13sp"/>
            </horizontal>
            <horizontal gravity="center_vertical">
                <text id="l3Label" text="三圈ms: 25" textColor="#fff" textSize="12sp" w="150"/>
                <button id="l3Minus" text="-" w="50" h="50" textSize="13sp"/>
                <button id="l3Plus" text="+" w="50" h="50" textSize="13sp"/>
            </horizontal>

            <button id="actionBtn" text="执行种植" textSize="14sp" h="55" marginTop="6"/>
            <text id="timeText" text="耗时：--" textColor="#00ff88" textSize="12sp"/>

            <button id="closeBtn" text="关闭面板" textSize="12sp" h="40" marginTop="8"/>
        </vertical>
    </frame>
);

panel.setPosition(20, 30);

var sx, sy, srx, sry;
panel.dragHandle.setOnTouchListener(function (view, event) {
    switch (event.getAction()) {
        case event.ACTION_DOWN:
            sx = panel.getX(); sy = panel.getY();
            srx = event.getRawX(); sry = event.getRawY();
            return true;
        case event.ACTION_MOVE:
            panel.setPosition(sx + (event.getRawX() - srx), sy + (event.getRawY() - sry));
            return true;
    }
    return true;
});

// 刷新5行数值显示，跟着 currentMode 走
function refreshLabels() {
    var p = cfg[currentMode];
    panel.topYLabel.setText("上边缘: " + p.topY);
    panel.bottomYLabel.setText("下边缘: " + p.bottomY);
    panel.l1Label.setText("一圈ms: " + p.loop1Ms);
    panel.l2Label.setText("二圈ms: " + p.loop2Ms);
    panel.l3Label.setText("三圈ms: " + p.loop3Ms);

    var isWheat = currentMode === "wheat";
    panel.modeBtn.setText("当前：" + (isWheat ? "种植 (点击切到收割)" : "收割 (点击切到种植)"));
    panel.actionBtn.setText(isWheat ? "执行种植" : "执行收割");
    panel.timeText.setText("耗时：--");
}
refreshLabels();

panel.modeBtn.click(function () {
    currentMode = (currentMode === "wheat") ? "sickle" : "wheat";
    refreshLabels();
});

panel.topYMinus.click(function () { cfg[currentMode].topY = Math.max(0, cfg[currentMode].topY - 5); refreshLabels(); });
panel.topYPlus.click(function () { cfg[currentMode].topY += 5; refreshLabels(); });
panel.bottomYMinus.click(function () { cfg[currentMode].bottomY = Math.max(0, cfg[currentMode].bottomY - 5); refreshLabels(); });
panel.bottomYPlus.click(function () { cfg[currentMode].bottomY += 5; refreshLabels(); });
panel.l1Minus.click(function () { cfg[currentMode].loop1Ms = Math.max(5, cfg[currentMode].loop1Ms - 1); refreshLabels(); });
panel.l1Plus.click(function () { cfg[currentMode].loop1Ms += 1; refreshLabels(); });
panel.l2Minus.click(function () { cfg[currentMode].loop2Ms = Math.max(5, cfg[currentMode].loop2Ms - 1); refreshLabels(); });
panel.l2Plus.click(function () { cfg[currentMode].loop2Ms += 1; refreshLabels(); });
panel.l3Minus.click(function () { cfg[currentMode].loop3Ms = Math.max(5, cfg[currentMode].loop3Ms - 1); refreshLabels(); });
panel.l3Plus.click(function () { cfg[currentMode].loop3Ms += 1; refreshLabels(); });

panel.actionBtn.click(function () {
    var mode = currentMode; // 防止执行途中被切换按钮打断
    panel.timeText.setText("耗时：跑动作中...");
    threads.start(function () {
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
