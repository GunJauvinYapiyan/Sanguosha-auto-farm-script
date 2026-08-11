// 好像小麦测试还是有点问题，我的主脚本用这个参数不会偏移。

// 确保无障碍服务已开启
auto.waitFor();

// 清理上一次运行可能残留的悬浮窗
floaty.closeAll();
setScreenMetrics(2412, 1080);

// ================= 从主脚本复刻的环境配置 =================
var CONFIG = {
    LEFT_X: 170, RIGHT_X: 2250,
    shrink: 90, shrink2: 55, holdMs: 400
};

var BASE_STEPS = {
    entry: 15,
    l1_top: 40, l1_right: 20, l1_bottom: 40, l1_left: 20,
    l2_enter: 10, l2_top: 40, l2_right: 20, l2_bottom: 40,
    l3_close: 18, l3_enter: 8, l3_top: 22, l3_right: 10, l3_bottom: 22
};

// 当前默认测试参数（沿用主脚本小麦参数）
var testParams = {
    topY: 151, // 153 水稻
    bottomY: 924,
    loop1Ms: 19, // 22 水稻
    loop2Ms: 17, // 21 水稻
    loop3Ms: 15, // 20 水稻
    icon: [740, 910] // [935, 900] 水稻
};

// ================= 核心算法（原汁原味） =================
function scaleSteps(base, ms) { return Math.max(2, Math.round(base * ms / 25)); }
function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
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

// ================= 针对测试需求改造的轨迹生成 =================
function runTestGesture() {
    var p = testParams;
    var points = [];
    var holdReps = Math.max(6, Math.round(CONFIG.holdMs / 60));
    
    // 1. 在图标位置长按
    for (var r = 0; r < holdReps; r++) points.push(p.icon);
    
    // 2. 按你的思路：不转圈！直接往左上方偏开 100 像素作为一个安全过渡点，避开中心土地
    var safePoint = [p.icon[0] - 100, p.icon[1] - 100];
    points = points.concat(generateLine(p.icon, safePoint, 10));

    var l1 = CONFIG.LEFT_X, r1 = CONFIG.RIGHT_X, t1 = p.topY, b1 = p.bottomY;
    var TL = [l1, t1], TR = [r1, t1], BR = [r1, b1], BL = [l1, b1];

    // 3. 从过渡点直奔左上角
    points = points.concat(generateLine(safePoint, TL, scaleSteps(BASE_STEPS.entry, p.loop1Ms)));

    // 4. 跑一圈
    points = points.concat(generateLine(TL, TR, scaleSteps(BASE_STEPS.l1_top, p.loop1Ms)));
    points = points.concat(generateLine(TR, BR, scaleSteps(BASE_STEPS.l1_right, p.loop1Ms)));
    points = points.concat(generateLine(BR, BL, scaleSteps(BASE_STEPS.l1_bottom, p.loop1Ms)));
    points = points.concat(generateLine(BL, TL, scaleSteps(BASE_STEPS.l1_left, p.loop1Ms)));

    // 5. 跑二圈
    var l2 = l1 + CONFIG.shrink, r2 = r1 - CONFIG.shrink, t2 = t1 + CONFIG.shrink, b2 = b1 - CONFIG.shrink;
    var TL2 = [l2, t2], TR2 = [r2, t2], BR2 = [r2, b2], BL2 = [l2, b2];
    var l2TopSteps = scaleSteps(BASE_STEPS.l2_top, p.loop2Ms);
    var l2TopDist = dist(TL2, TR2);
    points = points.concat(generateLine(TL, TL2, matchSteps(TL, TL2, l2TopSteps, l2TopDist)));
    points = points.concat(generateLine(TL2, TR2, l2TopSteps));
    points = points.concat(generateLine(TR2, BR2, scaleSteps(BASE_STEPS.l2_right, p.loop2Ms)));
    points = points.concat(generateLine(BR2, BL2, scaleSteps(BASE_STEPS.l2_bottom, p.loop2Ms)));

    // 6. 跑三圈
    var lastCorner = BL2;
    points = points.concat(generateLine(BL2, TL2, scaleSteps(BASE_STEPS.l3_close, p.loop2Ms)));

    var l3 = l2 + CONFIG.shrink2, r3 = r2 - CONFIG.shrink2, t3 = t2 + CONFIG.shrink2, b3 = b2 - CONFIG.shrink2;
    var TL3 = [l3, t3], TR3 = [r3, t3], BR3 = [r3, b3], BL3 = [l3, b3];
    var l3TopSteps = scaleSteps(BASE_STEPS.l3_top, p.loop3Ms);
    var l3TopDist = dist(TL3, TR3);
    points = points.concat(generateLine(TL2, TL3, matchSteps(TL2, TL3, l3TopSteps, l3TopDist)));
    points = points.concat(generateLine(TL3, TR3, l3TopSteps));
    points = points.concat(generateLine(TR3, BR3, scaleSteps(BASE_STEPS.l3_right, p.loop3Ms)));
    points = points.concat(generateLine(BR3, BL3, scaleSteps(BASE_STEPS.l3_bottom, p.loop3Ms)));

    // 7. 直接在三圈的最下角收工，绝不返回中心
    var duration = Math.max(points.length * 25, 500);
    gesture.apply(null, [duration].concat(points));
}

// ================= 悬浮窗面板 UI =================
var panel = floaty.window(
    <frame id="root" bg="#DD222222">
        <vertical padding="6">
            <text id="dragHandle" text="≡ 按住这里拖动面板 ≡" textColor="#ffdd00" textSize="12sp" bg="#33ffffff" padding="4" gravity="center"/>

            <horizontal gravity="center_vertical" marginTop="8">
                <text id="topYLabel" text="上边缘: 152" textColor="#fff" textSize="11sp" w="112" marginLeft="6"/>
                <button id="topYMinus" text="-" w="36" h="36" textSize="12sp" marginLeft="6" padding="0"/>
                <button id="topYPlus" text="+" w="3    var t0 = Date.now();
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
