// ================= 主页大面积纯色特征判定 & 可视化拖动校准脚本 =================
// 使用说明：
// 1. 三个红框采用外扩 3px 的全透明中空 floaty.rawWindow 绘制边框，且拖动标签全部置于红框【外部】，
//    保证红框内部 [x, y, w, h] 100% 是纯原画像素，绝不遮挡或改变任何色素值！
// 2. 直接按住每个红框旁边的【✥ 拖我:XX】标签即可用手指自由拖动红框位置；
//    也可以用控制面板上的【←/→/↑/↓】和【宽-/宽+/高-/高+】按钮调整位置与大小。
// 3. 调好后点击【确定并复制PANEL配置行】，即可弹窗查看并一键复制单行配置，直接粘贴到主脚本顶部 PANEL 中。

auto.waitFor();
floaty.closeAll();

if (device.width < device.height) {
    toastLog("【警告】请先切到横屏，再运行此脚本！");
    while (device.width < device.height) { sleep(500); }
    sleep(1500);
}

toastLog("即将请求截屏权限...");
var checkPermission = false;
try { checkPermission = requestScreenCapture(); } catch (e) {}
if (!checkPermission) {
    toastLog("截屏权限被拒绝，脚本退出");
    exit();
}

setScreenMetrics(2412, 1080);

var screenW = Math.max(device.width, device.height);
var screenH = Math.min(device.width, device.height);
var scaleX = screenW / 2412;
var scaleY = screenH / 1080;

// ================= 核心配置 =================
var TARGET_COLOR = colors.rgb(162, 119, 64);
var TOLERANCE = 10;
var CHECK_REGIONS = {
    "右上区域": { rect: [1850, 20, 460, 65], minPixels: 900 },
    "左侧区域": { rect: [110, 180, 100, 520], minPixels: 1000 },
    "底部区域": { rect: [1275, 945, 875, 90], minPixels: 3000 }
};
var REGION_KEYS = ["右上区域", "左侧区域", "底部区域"];
var currentTargetIdx = 0;
var stepPxList = [10, 25, 50, 5];
var currentStepIdx = 0;
var lastCounts = { "右上区域": 0, "左侧区域": 0, "底部区域": 0 };

// ================= 三个中空红框 (外扩边框，内部100%无遮挡) + 框外拖动把手 =================
var borderWins = {};
var handleWins = {};
var BORDER_OUTSET = 4; // 红框往外扩4px，确保检测区域 rect 内部连1像素红线都没有

function getHandlePosition(key, bx, by, bw, bh) {
    // 把拖动标签放在检测框外部，绝不遮挡检测框内部像素
    if (key === "右上区域") {
        return [bx, Math.min(screenH - 40, by + bh + 6)];
    } else if (key === "左侧区域") {
        return [Math.min(screenW - 120, bx + bw + 6), by];
    } else {
        return [bx, Math.max(0, by - 42)];
    }
}

function createRegionBoxAndHandle(idx, key) {
    // 1. 纯透明中空红框（用 rawWindow + setTouchable(false)，无任何系统底色，且外扩4px不占检测区）
    var borderWin = floaty.rawWindow(
        <frame id="root" bg="#00000000" padding="0">
            <view w="match_parent" h="2" bg="#FFFF0000" layout_gravity="top"/>
            <view w="match_parent" h="2" bg="#FFFF0000" layout_gravity="bottom"/>
            <view w="2" h="match_parent" bg="#FFFF0000" layout_gravity="left"/>
            <view w="2" h="match_parent" bg="#FFFF0000" layout_gravity="right"/>
        </frame>
    );
    borderWin.setTouchable(false);
    borderWins[key] = borderWin;

    // 2. 位于红框外部的可拖动把手（用标准 floaty.window，手指按住即可丝滑拖动红框）
    var handleWin = floaty.window(
        <frame id="wrap" bg="#CCFF0000" paddingLeft="6" paddingRight="6" paddingTop="4" paddingBottom="4">
            <text id="label" text=" ✥ 拖我 " textColor="#FFFFFF" textSize="11sp" textStyle="bold"/>
        </frame>
    );
    handleWin.setAdjustEnabled(false);
    handleWins[key] = handleWin;

    updateRegionBoxVisual(key);

    var startRectX, startRectY, downRawX, downRawY;
    handleWin.label.setOnTouchListener(function (view, event) {
        switch (event.getAction()) {
            case event.ACTION_DOWN:
                currentTargetIdx = idx;
                startRectX = CHECK_REGIONS[key].rect[0];
                startRectY = CHECK_REGIONS[key].rect[1];
                downRawX = event.getRawX();
                downRawY = event.getRawY();
                refreshAllBoxVisuals();
                return true;
            case event.ACTION_MOVE:
                var dx = Math.round((event.getRawX() - downRawX) / scaleX);
                var dy = Math.round((event.getRawY() - downRawY) / scaleY);
                var rw = CHECK_REGIONS[key].rect[2];
                var rh = CHECK_REGIONS[key].rect[3];
                CHECK_REGIONS[key].rect[0] = Math.max(0, Math.min(2412 - rw, startRectX + dx));
                CHECK_REGIONS[key].rect[1] = Math.max(0, Math.min(1080 - rh, startRectY + dy));
                updateRegionBoxVisual(key);
                return true;
        }
        return true;
    });
}

function updateRegionBoxVisual(key) {
    var borderWin = borderWins[key];
    var handleWin = handleWins[key];
    if (!borderWin || !handleWin) return;

    var r = CHECK_REGIONS[key].rect;
    var bx = Math.round(r[0] * scaleX);
    var by = Math.round(r[1] * scaleY);
    var bw = Math.max(20, Math.round(r[2] * scaleX));
    var bh = Math.max(20, Math.round(r[3] * scaleY));

    // 红框外扩 BORDER_OUTSET 像素，内部 [bx, by, bw, bh] 完全裸露无遮挡
    borderWin.setPosition(bx - BORDER_OUTSET, by - BORDER_OUTSET);
    ui.run(function () {
        try {
            var lp = borderWin.root.getLayoutParams();
            lp.width = bw + BORDER_OUTSET * 2;
            lp.height = bh + BORDER_OUTSET * 2;
            borderWin.root.setLayoutParams(lp);
        } catch (e) {}
    });

    // 把手放在红框外侧
    var hPos = getHandlePosition(key, bx, by, bw, bh);
    handleWin.setPosition(hPos[0], hPos[1]);
    var isCurrent = (REGION_KEYS[currentTargetIdx] === key);
    handleWin.label.post(function () {
        try {
            handleWin.label.setText((isCurrent ? "✥ ★拖我:" : "✥ 拖我:") + key);
            handleWin.wrap.setBackgroundColor(colors.parseColor(isCurrent ? "#FFD600" : "#CCFF0000"));
            handleWin.label.setTextColor(colors.parseColor(isCurrent ? "#000000" : "#FFFFFF"));
        } catch (e) {}
    });
}

for (var i = 0; i < REGION_KEYS.length; i++) {
    createRegionBoxAndHandle(i, REGION_KEYS[i]);
}

// ================= 悬浮主控制面板 (放在屏幕正中偏上，避开左/右上/底部三个检测区) =================
var ctrlWin = floaty.window(
    <vertical id="root" bg="#DD222222" padding="8" w="auto" h="auto">
        <horizontal gravity="center_vertical">
            <text id="dragHandle" text=" ≡ 拖我移动面板 " textColor="#FFFFFF" textSize="11sp" bg="#555555" padding="4" marginRight="8"/>
            <text id="curTarget" text="当前选中: 【右上区域】" textColor="#FFEB3B" textSize="12sp" textStyle="bold"/>
            <button id="switchTargetBtn" text="切换框" textSize="11sp" textColor="#FFFFFF" bg="#2196F3" h="30" paddingLeft="8" paddingRight="8" marginLeft="6"/>
            <button id="stepBtn" text="步长:10" textSize="11sp" textColor="#FFFFFF" bg="#757575" h="30" paddingLeft="6" paddingRight="6" marginLeft="4"/>
        </horizontal>

        <horizontal gravity="center_vertical" marginTop="5">
            <text text="移动: " textColor="#CCCCCC" textSize="11sp"/>
            <button id="btnLeft" text="←" textSize="12sp" textColor="#FFFFFF" bg="#455A64" w="38" h="30" marginRight="3"/>
            <button id="btnRight" text="→" textSize="12sp" textColor="#FFFFFF" bg="#455A64" w="38" h="30" marginRight="3"/>
            <button id="btnUp" text="↑" textSize="12sp" textColor="#FFFFFF" bg="#455A64" w="38" h="30" marginRight="3"/>
            <button id="btnDown" text="↓" textSize="12sp" textColor="#FFFFFF" bg="#455A64" w="38" h="30" marginRight="8"/>

            <text text="宽高: " textColor="#CCCCCC" textSize="11sp"/>
            <button id="btnWMinus" text="宽-" textSize="11sp" textColor="#FFFFFF" bg="#37474F" w="40" h="30" marginRight="3"/>
            <button id="btnWPlus" text="宽+" textSize="11sp" textColor="#FFFFFF" bg="#37474F" w="40" h="30" marginRight="3"/>
            <button id="btnHMinus" text="高-" textSize="11sp" textColor="#FFFFFF" bg="#37474F" w="40" h="30" marginRight="3"/>
            <button id="btnHPlus" text="高+" textSize="11sp" textColor="#FFFFFF" bg="#37474F" w="40" h="30"/>
        </horizontal>

        <text id="details" text="正在读取色素点数..." textColor="#FFFFFF" textSize="11sp" marginTop="6"/>

        <horizontal gravity="center_vertical" marginTop="6">
            <button id="btnCopyCode" text="确定并复制PANEL配置行" textSize="12sp" textColor="#FFFFFF" bg="#4CAF50" h="34" paddingLeft="12" paddingRight="12" marginRight="8"/>
            <button id="btnExit" text="退出脚本" textSize="12sp" textColor="#FFFFFF" bg="#E53935" h="34" w="76"/>
        </horizontal>
    </vertical>
);
ctrlWin.setAdjustEnabled(false);
ctrlWin.setPosition(Math.round(screenW * 0.25), Math.round(screenH * 0.22));

var sx, sy, srx, sry;
ctrlWin.dragHandle.setOnTouchListener(function (view, event) {
    switch (event.getAction()) {
        case event.ACTION_DOWN:
            sx = ctrlWin.getX(); sy = ctrlWin.getY();
            srx = event.getRawX(); sry = event.getRawY();
            return true;
        case event.ACTION_MOVE:
            ctrlWin.setPosition(Math.round(sx + (event.getRawX() - srx)), Math.round(sy + (event.getRawY() - sry)));
            return true;
    }
    return true;
});

function getCurKey() { return REGION_KEYS[currentTargetIdx]; }
function getCurStep() { return stepPxList[currentStepIdx]; }

function refreshAllBoxVisuals() {
    for (var i = 0; i < REGION_KEYS.length; i++) {
        updateRegionBoxVisual(REGION_KEYS[i]);
    }
    ctrlWin.curTarget.post(function () {
        ctrlWin.curTarget.setText("当前选中: 【" + getCurKey() + "】");
    });
}

ctrlWin.switchTargetBtn.click(function () {
    currentTargetIdx = (currentTargetIdx + 1) % REGION_KEYS.length;
    refreshAllBoxVisuals();
});

ctrlWin.stepBtn.click(function () {
    currentStepIdx = (currentStepIdx + 1) % stepPxList.length;
    var step = getCurStep();
    ctrlWin.stepBtn.post(function () { ctrlWin.stepBtn.setText("步长:" + step); });
    toastLog("已切换步长为: " + step + " px");
});

function adjustCurrentRegion(dx, dy, dw, dh) {
    var key = getCurKey();
    var r = CHECK_REGIONS[key].rect;
    var step = getCurStep();
    var nx = Math.max(0, Math.min(2400, r[0] + dx * step));
    var ny = Math.max(0, Math.min(1060, r[1] + dy * step));
    var nw = Math.max(30, Math.min(2412 - nx, r[2] + dw * step));
    var nh = Math.max(25, Math.min(1080 - ny, r[3] + dh * step));
    CHECK_REGIONS[key].rect = [nx, ny, nw, nh];
    updateRegionBoxVisual(key);
}

ctrlWin.btnLeft.click(function () { adjustCurrentRegion(-1, 0, 0, 0); });
ctrlWin.btnRight.click(function () { adjustCurrentRegion(1, 0, 0, 0); });
ctrlWin.btnUp.click(function () { adjustCurrentRegion(0, -1, 0, 0); });
ctrlWin.btnDown.click(function () { adjustCurrentRegion(0, 1, 0, 0); });
ctrlWin.btnWMinus.click(function () { adjustCurrentRegion(0, 0, -1, 0); });
ctrlWin.btnWPlus.click(function () { adjustCurrentRegion(0, 0, 1, 0); });
ctrlWin.btnHMinus.click(function () { adjustCurrentRegion(0, 0, 0, -1); });
ctrlWin.btnHPlus.click(function () { adjustCurrentRegion(0, 0, 0, 1); });

function buildPanelLineString() {
    var r1 = CHECK_REGIONS["右上区域"].rect;
    var r2 = CHECK_REGIONS["左侧区域"].rect;
    var r3 = CHECK_REGIONS["底部区域"].rect;
    var m1 = CHECK_REGIONS["右上区域"].minPixels;
    var m2 = CHECK_REGIONS["左侧区域"].minPixels;
    var m3 = CHECK_REGIONS["底部区域"].minPixels;
    return '    HOME_CHECK_REGIONS: { "右上区域": { rect: [' + r1.join(', ') + '], minPixels: ' + m1 + ' }, "左侧区域": { rect: [' + r2.join(', ') + '], minPixels: ' + m2 + ' }, "底部区域": { rect: [' + r3.join(', ') + '], minPixels: ' + m3 + ' } }';
}

ctrlWin.btnCopyCode.click(function () {
    threads.start(function () {
        var panelLine = buildPanelLineString();
        var r1 = CHECK_REGIONS["右上区域"].rect;
        var r2 = CHECK_REGIONS["左侧区域"].rect;
        var r3 = CHECK_REGIONS["底部区域"].rect;
        var summary =
            "右上区域: [" + r1.join(", ") + "]  (实测:" + lastCounts["右上区域"] + ")\n" +
            "左侧区域: [" + r2.join(", ") + "]  (实测:" + lastCounts["左侧区域"] + ")\n" +
            "底部区域: [" + r3.join(", ") + "]  (实测:" + lastCounts["底部区域"] + ")\n\n" +
            "生成的主脚本顶部 PANEL 控制面板单行代码：\n\n" +
            panelLine + "\n\n" +
            "点击【确定】直接复制这行代码到剪贴板！";
        var ok = dialogs.confirm("三框范围数值", summary);
        if (ok) {
            setClip(panelLine);
            toastLog("已复制到剪贴板！可直接粘贴替换主脚本顶部 PANEL 里的 HOME_CHECK_REGIONS 那一行");
        }
    });
});

ctrlWin.btnExit.click(function () {
    toastLog("独立测试脚本已退出");
    floaty.closeAll();
    exit();
});

// ================= 实时截屏取色检测循环 (与原版完全一致的取色调用) =================
function checkSingleImg(img) {
    var matchCount = 0;
    var detailsText = "";
    for (var i = 0; i < REGION_KEYS.length; i++) {
        var key = REGION_KEYS[i];
        var config = CHECK_REGIONS[key];
        var points = images.findAllPointsForColor(img, TARGET_COLOR, {
            region: config.rect,
            threshold: TOLERANCE
        });
        var found = points ? points.length : 0;
        lastCounts[key] = found;
        var mark = (found >= config.minPixels) ? "✅" : "❌";
        if (found >= config.minPixels) matchCount++;
        detailsText += mark + " " + key + ": [" + config.rect.join(", ") + "] (需≥" + config.minPixels + " | 实测:" + found + ")\n";
    }
    return { isHome: (matchCount === 3), text: detailsText.trim() };
}

threads.start(function () {
    while (true) {
        try {
            var img = captureScreen();
            if (img) {
                var res = checkSingleImg(img);
                img.recycle();
                ctrlWin.details.post(function () {
                    ctrlWin.details.setText(res.text);
                });
            }
        } catch (e) {
            ctrlWin.details.post(function () {
                ctrlWin.details.setText("截屏检测异常: " + e);
            });
        }
        sleep(800);
    }
});

setInterval(function () {}, 1000);
