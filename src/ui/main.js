Ext.namespace("SYNO.SDS.OoklaSpeedtest");

// -----------------------------------------------------------------
// App entry point
// -----------------------------------------------------------------
Ext.define("SYNO.SDS._ThirdParty.App.OoklaSpeedtest", {
    extend: "SYNO.SDS.AppInstance",
    appWindowName: "SYNO.SDS.OoklaSpeedtest.MainWindow",
    constructor: function() {
        this.callParent(arguments);
    }
});

// -----------------------------------------------------------------
// Main window - embeds the existing Ookla Speedtest page via iframe.
// index.html/main.js already implement the full speedtest UI,
// so there's no need to rebuild it as Ext JS components; the window
// just hosts it at its served path under /webman/3rdparty/OoklaSpeedtest/.
// -----------------------------------------------------------------
Ext.define("SYNO.SDS.OoklaSpeedtest.MainWindow", {
    extend: "SYNO.SDS.AppWindow",

    IFRAME_SRC: "/webman/3rdparty/OoklaSpeedtest/index.html",

    constructor: function(a) {
        this.appInstance = a.appInstance;
        SYNO.SDS.OoklaSpeedtest.MainWindow.superclass.constructor.call(this, Ext.apply({
            layout: "fit",
            resizable: true,
            cls: "syno-app-win ooklaspeedtest-win",
            maximizable: true,
            minimizable: true,
            showHelp: false,
            width: 800,
            height: 630,
            html: this.buildHtml(),
            listeners: {
                afterrender: {
                    fn: this.onAfterRender,
                    scope: this
                }
            }
        }, a));
    },

    buildHtml: function() {
        return [
            '<style>',
            '  .ooklaspeedtest-body { display:flex; height:100%; }',
            '  .ooklaspeedtest-frame { flex:1 1 auto; width:100%; height:100%; border:0; }',
            '</style>',
            '<div class="ooklaspeedtest-body">',
            '  <iframe class="ooklaspeedtest-frame" src="' + this.IFRAME_SRC + '"></iframe>',
            '</div>'
        ].join("");
    },

    onAfterRender: function() {
        var el = this.body.dom;
        this.frameEl = el.querySelector(".ooklaspeedtest-frame");
    },

    onClose: function() {
        SYNO.SDS.OoklaSpeedtest.MainWindow.superclass.onClose.apply(this, arguments);
        this.doClose();
        return true;
    }
});
