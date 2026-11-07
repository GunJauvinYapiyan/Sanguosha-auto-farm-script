// ================= 主页大面积纯色特征判定 & 可视化拖动校准脚本 =================
// 使用说明：
// 1. 保持外扩 4px 的全透明中空 floaty.rawWindow 红框 + 框外独立拖动标签【✥ 拖我:XX】设计，
//    检测区域内部 100% 裸露原画，绝不遮挡或污染色素值！
// 2. 自动补偿横屏左侧挖孔/状态栏偏移（实测你的手机横屏 X 轴偏移为 +104px，已通过 getLocationOnScreen 自动校准补偿），
//    现在红框显示位置与实际截屏检测位置 100% 严丝合缝！
// 3. 控制面板已精简掉多余的方向键和切换框按钮，直接用手指按住【✥ 拖我:XX】拖动即可。

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

// 横屏左侧挖孔/状态栏引起的 floaty 窗口坐标与截屏坐标偏移量（默认104px，启动后自动通过 getLocationOnScreen 精确校准）
var windowOffsetX = Math.round(104 * scaleX);
var windowOffsetY = 0;

// ================= 核心配置 =================
var TARGET_COLOR = colors.rgb(162, 119, 64);
var TOLERANCE = 10;
var CHECK_REGIONS = {
    "右上区域": { rect: [1850, 20, 460, 65], minPixels: 900 },
    "左侧区域": { rect: [110, 180, 100, 520], minPixels: 1000 },
    "底部区域": { rect: [1275, 945, 875, 90], minPixels: 3000 }
};
var REGION_KEYS = ["右上区域", "左侧区域", "底部区域"];
var lastCounts = { "右上区域": 0, "左侧区域": 0, "底部区域": 0 };

// ================= 三个中空红框 (外扩4px全透明) + 框外拖动把手 =================
var borderWins = {};
var handleWins = {};
var BORDER_OUTSET = 4;

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
                startRectX = CHECK_REGIONS[key].rect[0];
                startRectY = CHECK_REGIONS[key].rect[1];
                downRawX = event.getRawX();
                downRawY = event.getRawY();
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

    // 减去横屏状态栏/挖孔偏移量 windowOffsetX，使屏幕实际渲染位置与截屏坐标严丝合缝
    borderWin.setPosition(bx - BORDER_OUTSET - windowOffsetX, by - BORDER_OUTSET - windowOffsetY);
    ui.run(function () {
        try {
            var lp = borderWin.root.getLayoutParams();
            lp.width = bw + BORDER_OUTSET * 2;
            lp.height = bh + BORDER_OUTSET * 2;
            borderWin.root.setLayoutParams(lp);
        } catch (e) {}
    });

    var hPos = getHandlePosition(key, bx, by, bw, bh);
    handleWin.setPosition(hPos[0] - windowOffsetX, hPos[1] - windowOffsetY);
    handleWin.label.post(function () {
        try {
            handleWin.label.setText("✥ 拖我:" + key);
        } catch (e) {}
    });
}

function refreshAllBoxVisuals() {
    for (var i = 0; i < REGION_KEYS.length; i++) {
        updateRegionBoxVisual(REGION_KEYS[i]);
    }
}

for (var i = 0; i < REGION_KEYS.length; i++) {
    createRegionBoxAndHandle(i, REGION_KEYS[i]);
}

// 启动后通过 Android 原生 getLocationOnScreen 实测校准浮窗与物理屏幕的真实偏移量
ui.post(function () {
    try {
        var firstKey = REGION_KEYS[0];
        var bw = borderWins[firstKey];
        var r = CHECK_REGIONS[firstKey].rect;
        var expectedScreenX = Math.round(r[0] * scaleX) - BORDER_OUTSET;
        var expectedScreenY = Math.round(r[1] * scaleY) - BORDER_OUTSET;
        var loc = util.java.array('int', 2);
        bw.root.getLocationOnScreen(loc);
        var errX = loc[0] - expectedScreenX;
        var errY = loc[1] - expectedScreenY;
        if (Math.abs(errX) > 1 || Math.abs(errY) > 1) {
            windowOffsetX += errX;
            windowOffsetY += errY;
            refreshAllBoxVisuals();
        }
    } catch (e) {}
}, 300);

// ================= 精简悬浮主控制面板 (去掉了多余的选择框和上下左右移动键) =================
var ctrlWin = floaty.window(
    <vertical id="root" bg="#DD222222" padding="10" w="auto" h="auto">
        <text id="dragHandle" text=" ≡ 拖我移动面板 " textColor="#FFFF00" textSize="12sp" textStyle="bold" bg="#555555" padding="4" gravity="center"/>
        <text id="details" text="正在读取色素点数..." textColor="#FFFFFF" textSize="11sp" marginTop="6"/>
        <horizontal gravity="center_vertical" marginTop="8">
            <button id="btnCopyCode" text="确定并复制PANEL配置行" textSize="12sp" textColor="#FFFFFF" bg="#4CAF50" h="36" paddingLeft="12" paddingRight="12" marginRight="8"/>
            <button id="btnExit" text="退出脚本" textSize="12sp" textColor="#FFFFFF" bg="#E53935" h="36" w="76"/>
        </horizontal>
    </vertical>
);
ctrlWin.setAdjustEnabled(false);
ctrlWin.setPosition(Math.round(screenW * 0.28) - windowOffsetX, Math.round(screenH * 0.25) - windowOffsetY);

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

// ================= 实时截屏取色检测循环 =================
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
