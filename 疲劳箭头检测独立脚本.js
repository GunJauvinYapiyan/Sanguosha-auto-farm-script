// ================= 疲劳Debuff红下箭头（(500,200) & (600,200)）独立检测测试脚本 =================
// 使用说明：
// 1. 启动后会在屏幕左上角名片下方的 (500, 200) 与 (600, 200) 两个位置显示外扩中空红框（内部0遮挡）。
// 2. 实时检测这两个区域内是否存在红色下箭头特征色 RGB(254, 139, 85)（容差 20）。
// 3. 只要任意一个框内匹配点数 ≥ 30（实测红箭头出现时约有 800+ 像素命中），即判定为【检测到疲劳Debuff】。

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

// ================= 核心检测参数 =================
var TARGET_RGB = [254, 139, 85];
var TARGET_COLOR = colors.rgb(254, 139, 85);
var TOLERANCE = 20;
var MIN_PIXELS = 30;

var DEBUFF_REGIONS = {
    "点1(500,200)区": [462, 162, 76, 76],
    "点2(600,200)区": [562, 162, 76, 76]
};
var KEYS = ["点1(500,200)区", "点2(600,200)区"];
var BORDER_OUTSET = 4;

// ================= 绘制外扩中空红框（内部完全无遮挡） =================
var borderWins = {};

function createOutsetBox(key) {
    var r = DEBUFF_REGIONS[key];
    var bx = Math.round(r[0] * scaleX) - BORDER_OUTSET;
    var by = Math.round(r[1] * scaleY) - BORDER_OUTSET;
    var bw = Math.round(r[2] * scaleX) + BORDER_OUTSET * 2;
    var bh = Math.round(r[3] * scaleY) + BORDER_OUTSET * 2;

    var win = floaty.rawWindow(
        <frame id="root" bg="#00000000" padding="0">
            <view w="match_parent" h="2" bg="#FFFF0000" layout_gravity="top"/>
            <view w="match_parent" h="2" bg="#FFFF0000" layout_gravity="bottom"/>
            <view w="2" h="match_parent" bg="#FFFF0000" layout_gravity="left"/>
            <view w="2" h="match_parent" bg="#FFFF0000" layout_gravity="right"/>
        </frame>
    );
    win.setTouchable(false);
    win.setPosition(bx, by);
    ui.run(function () {
        try {
            var lp = win.root.getLayoutParams();
            lp.width = bw;
            lp.height = bh;
            win.root.setLayoutParams(lp);
        } catch (e) {}
    });
    borderWins[key] = win;
}

for (var i = 0; i < KEYS.length; i++) {
    createOutsetBox(KEYS[i]);
}

// ================= 悬浮状态面板 =================
var ctrlWin = floaty.window(
    <vertical id="root" bg="#DD222222" padding="10" w="auto" h="auto">
        <text id="dragHandle" text=" ≡ 疲劳Debuff红箭头检测测试 (按住此处可拖动) " textColor="#FFFF00" textSize="13sp" textStyle="bold" paddingBottom="6"/>
        <text id="status" text="正在检测..." textColor="#FFFFFF" textSize="13sp" textStyle="bold"/>
        <text id="details" text="等待数据..." textColor="#E0E0E0" textSize="11sp" marginTop="4"/>
        <button id="exitBtn" text="退出测试脚本" textSize="12sp" textColor="#FFFFFF" bg="#E53935" h="34" w="120" marginTop="8"/>
    </vertical>
);
ctrlWin.setAdjustEnabled(false);
ctrlWin.setPosition(Math.round(screenW * 0.35), Math.round(screenH * 0.2));

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

ctrlWin.exitBtn.click(function () {
    toastLog("测试脚本已退出");
    floaty.closeAll();
    exit();
});

function countDebuffPixels(img, rect) {
    try {
        var pts = images.findAllPointsForColor(img, TARGET_COLOR, {
            region: rect,
            threshold: TOLERANCE
        });
        return pts ? pts.length : 0;
    } catch (e) {
        var x0 = rect[0], y0 = rect[1], w = rect[2], h = rect[3];
        var match = 0;
        for (var dx = 0; dx < w; dx += 2) {
            for (var dy = 0; dy < h; dy += 2) {
                var c = images.pixel(img, x0 + dx, y0 + dy);
                var diff = Math.max(
                    Math.abs(colors.red(c) - TARGET_RGB[0]),
                    Math.abs(colors.green(c) - TARGET_RGB[1]),
                    Math.abs(colors.blue(c) - TARGET_RGB[2])
                );
                if (diff <= TOLERANCE) match++;
            }
        }
        return match * 4;
    }
}

threads.start(function () {
    while (true) {
        try {
            var img = captureScreen();
            if (img) {
                var anyHit = false;
                var lines = [];
                for (var i = 0; i < KEYS.length; i++) {
                    var k = KEYS[i];
                    var r = DEBUFF_REGIONS[k];
                    var cnt = countDebuffPixels(img, r);
                    var cx = r[0] + Math.floor(r[2] / 2);
                    var cy = r[1] + Math.floor(r[3] / 2);
                    var cp = images.pixel(img, cx, cy);
                    var rgbStr = colors.red(cp) + "," + colors.green(cp) + "," + colors.blue(cp);
                    var hit = cnt >= MIN_PIXELS;
                    if (hit) anyHit = true;
                    lines.push((hit ? "🔴 [命中Debuff] " : "🟢 [正常无箭头] ") + k + ": 匹配像素=" + cnt + " (需≥" + MIN_PIXELS + ") | 中心RGB=(" + rgbStr + ")");
                }
                img.recycle();
                var textOut = lines.join("\n");
                ctrlWin.status.post(function () {
                    if (anyHit) {
                        ctrlWin.status.setText("【当前判定】：⚠️ 检测到红色下箭头 (处于疲劳Debuff状态！)");
                        ctrlWin.status.setTextColor(colors.parseColor("#FF5252"));
                    } else {
                        ctrlWin.status.setText("【当前判定】：✅ 未检测到红色下箭头 (作物状态正常)");
                        ctrlWin.status.setTextColor(colors.parseColor("#4CAF50"));
                    }
                    ctrlWin.details.setText(textOut);
                });
            }
        } catch (e) {
            ctrlWin.details.post(function () {
                ctrlWin.details.setText("检测异常: " + e);
            });
        }
        sleep(800);
    }
});

setInterval(function () {}, 1000);