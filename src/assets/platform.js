(function (D) {
  'use strict';
  var serial = 0;
  function buildVersion(options) {
    return Math.floor((Number(options && options.miniToolEnv && options.miniToolEnv.buildVersion) || 0) / 1000);
  }
  D.platform = {
    refresh: async function () {
      var request = ++serial;
      var xhs = window.xhs, api = xhs && xhs.miniTool;
      if (!api || typeof api.getWindowInfo !== 'function') return false;
      try {
        var options = xhs.launchOptions;
        if (!buildVersion(options) && typeof api.getLaunchOptions === 'function') options = await api.getLaunchOptions();
        if (buildVersion(options) < 9490) return false;
        var info = await api.getWindowInfo();
        if (request !== serial || !(info.windowWidth > 0) || !(info.windowHeight > 0)) return false;
        var sx = window.innerWidth / info.windowWidth, sy = window.innerHeight / info.windowHeight;
        var top = info.safeArea && Number(info.safeArea.top) || 0;
        var buttons = info.menuButtons || {};
        Object.keys(buttons).forEach(function (key) {
          var rect = buttons[key]; if (rect && Number.isFinite(rect.bottom)) top = Math.max(top, rect.bottom);
        });
        var style = document.documentElement.style;
        style.setProperty('--native-top', Math.max(0, top * sy) + 'px');
        if (info.safeArea) {
          style.setProperty('--native-left', Math.max(0, info.safeArea.left * sx || 0) + 'px');
          style.setProperty('--native-right', Math.max(0, (info.windowWidth - info.safeArea.right) * sx || 0) + 'px');
          style.setProperty('--safe-area-inset-bottom', Math.max(0, (info.windowHeight - info.safeArea.bottom) * sy || 0) + 'px');
        }
        return true;
      } catch (error) { return false; }
    }
  };
}(window.Domino));
