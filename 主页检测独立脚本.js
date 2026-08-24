// ================= 主页大面积纯色特征判定测试=================

// 使用说明：原理为对主页界面三片UI出现的区域进行取色比对，确保之后主页变化不影响检测精度。可以在自己整个农场上划一下，看看会不会出现误报（需要左侧和右上值达到1000以上，底部达到3000以上）。

auto.waitFor();

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

// ================= 核心配置 =================
var TARGET_COLOR = colors.rgb(162, 119, 64);
var TOLERANCE = 10; 
var CHECK_REGIONS = {
    "右上区域": { rect: [1850, 20, 460, 65], minPixels: 1000 },
    "左侧区域": { rect: [110, 180, 100, 520], minPixels: 1000 },
    "底部区域": { rect: [1275, 945, 875, 90], minPixels: 3000 }
};

// ================= 随机拖屏函数 =================
function randomDragScreen(durationMs) {
    var x1 = 500 + Math.floor(Math.random() * 1400);
    var y1 = 250 + Math.floor(Math.random() * 500);
    var dx = (Math.random() < 0.5 ? -1 : 1) * (300 + Math.floor(Math.random() * 400));
    var dy = (Math.random() < 0.5 ? -1 : 1) * (200 + Math.floor(Math.random() * 300));
    var x2 = Math.min(2350, Math.max(50, x1 + dx));
    var y2 = Math.min(1000, Math.max(150, y1 + dy));
    gesture(durationMs, [x1, y1], [x2, y2]);
}

var win = floaty.rawWindow(
    <vertical bg="#88000000" padding="12" gravity="left">
        <text id="title" text="主页检测中..." textColor="#FFFF00" textSize="16sp" textStyle="bold" paddingBottom="8"/>
        <text id="details" text="等待数据..." textColor="#FFFFFF" textSize="12sp" />
        <text text="(测试结束请按手机音量上键停止)" textColor="#AAAAAA" textSize="10sp" marginTop="8" />
    </vertical>
);
win.setTouchable(false);

ui.run(function(){ win.setPosition(device.width - 800, 100); });
toastLog("透视挂已启动！可以滑动照片测试了");

function checkSingleImg(img) {
    var matchCount = 0;
    var detailsText = "";
    for (var key in CHECK_REGIONS) {
        var config = CHECK_REGIONS[key];
        var points = images.findAllPointsForColor(img, TARGET_COLOR, {
            region: config.rect, threshold: TOLERANCE
        });
        var found = points ? points.length : 0;
        if (found >= config.minPixels) {
            matchCount++;
            detailsText += "✅ " + key + " (需" + config.minPixels + " 找" + found + ")\n";
        } else {
            detailsText += "❌ " + key + " (需" + config.minPixels + " 找" + found + ")\n";
        }
    }
    return { isHome: (matchCount === 3), text: detailsText.trim() };
}

threads.start(function() {
    while (true) {
        try {
            var img = captureScreen();
            if (img) {
                var res1 = checkSingleImg(img);
                if (res1.isHome) {
                    ui.run(function() {
                        win.title.setText("【初测】：✅命中！拖屏复测中...");
                        win.title.setTextColor(colors.parseColor("#FFFF00")); // 黄色警告
                        win.details.setText(res1.text);
                    });
                    
                    // 核心防御：执行拖屏并等待稳定
                    randomDragScreen(300);
                    sleep(1200); 
                    
                    var imgConfirm = captureScreen();
                    if (imgConfirm) {
                        var res2 = checkSingleImg(imgConfirm);
                        ui.run(function() {
                            if (res2.isHome) {
                                win.title.setText("【终判】：✅ 确认在主页！(防误报通过)");
                                win.title.setTextColor(colors.parseColor("#00FF00"));
                            } else {
                                win.title.setText("【终判】：❌ 农场误报！(拖屏后失效)");
                                win.title.setTextColor(colors.parseColor("#FF0000"));
                            }
                            win.details.setText(res2.text);
                        });
                    }
                } else {
                    ui.run(function() {
                        win.title.setText("【状态】：❌ 不在主页");
                        win.title.setTextColor(colors.parseColor("#FF0000"));
                        win.details.setText(res1.text);
                    });
                }
            }
        } catch (e) {
            ui.run(function() { win.title.setText("截屏报错"); });
        }
        sleep(2000);
    }
});