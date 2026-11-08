/* =============================================================================
   PEPO'S SAUNA — main.js
   i18n · booking calculator · messengers · gallery · UI interactions
   (обычно этот файл менять не нужно — всё настраивается в config.js / i18n.js)
   ============================================================================ */
(function () {
  "use strict";

  var CFG = window.PEPOS_CONFIG || {};
  var DICT = window.PEPOS_I18N || {};
  var LANGS = ["ru", "en", "ge"];
  var LS_LANG = "pepos_lang";
  var LS_PROMO = "pepos_promo_dismissed";

  var state = { lang: "ru" };

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---- translation helper: t("booking.title") ---- */
  function t(path, lang) {
    var d = DICT[lang || state.lang];
    if (!d) return "";
    var parts = path.split("."), cur = d;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return "";
      cur = cur[parts[i]];
    }
    return cur == null ? "" : cur;
  }

  /* ========================= CONTACTS / LINKS ========================= */
  function telHref(num) { return "tel:" + String(num).replace(/[^+\d]/g, ""); }
  function prettyPhone(num) {
    var s = String(num).replace(/[^\d]/g, "");
    // +995 555 491 292
    if (s.length >= 11) return "+" + s.slice(0,3) + " " + s.slice(3,6) + " " + s.slice(6,9) + " " + s.slice(9);
    return num;
  }
  function waLink(text) {
    var base = "https://wa.me/" + String(CFG.contacts.whatsapp).replace(/[^\d]/g, "");
    return base + (text ? "?text=" + encodeURIComponent(text) : "");
  }
  function tgLink() {
    var u = String(CFG.contacts.telegram || "").replace(/^@/, "");
    return "https://t.me/" + u;
  }
  function applyContacts() {
    var c = CFG.contacts;
    // phones
    $$("[data-phone-primary]").forEach(function (a) { a.href = telHref(c.phonePrimary); a.textContent = prettyPhone(c.phonePrimary); });
    $$("[data-phone-secondary]").forEach(function (a) {
      if (!c.phoneSecondary) { a.style.display = "none"; return; }
      a.href = telHref(c.phoneSecondary); a.textContent = prettyPhone(c.phoneSecondary);
    });
    $$("[data-hours]").forEach(function (e) { e.textContent = c.hours || ""; });
    // social
    $$("[data-social-ig]").forEach(function (a) { a.href = c.social.instagram; });
    $$("[data-social-tt]").forEach(function (a) { a.href = c.social.tiktok; });
    // route + map
    $$("[data-route]").forEach(function (a) { a.href = c.mapLink; });
    $$("[data-map]").forEach(function (f) { f.src = c.mapEmbed; });
    // generic messenger / call buttons (no booking context)
    refreshGenericCTAs();
  }

  function refreshGenericCTAs() {
    var greet = t("booking.msgIntro");
    $$("[data-wa]").forEach(function (a) { a.href = waLink(greet); a.target = "_blank"; a.rel = "noopener"; });
    $$("[data-tg]").forEach(function (a) { a.href = tgLink(); a.target = "_blank"; a.rel = "noopener"; });
    $$("[data-call]").forEach(function (a) { a.href = telHref(CFG.contacts.phonePrimary); });
  }

  /* ========================= BOOKING ========================= */
  var objectsById = {};
  (CFG.booking.objects || []).forEach(function (o) { objectsById[o.id] = o; });

  function getEl() {
    return {
      object: $("#bk-object"),
      date:   $("#bk-date"),
      time:   $("#bk-time"),
      hours:  $("#bk-hours"),
      guests: $("#bk-guests"),
      extras: $("#bk-extras"),
      name:   $("#bk-name"),
      total:  $("#bk-total")
    };
  }

  function buildObjectOptions() {
    var sel = $("#bk-object");
    if (!sel) return;
    var prev = sel.value;
    sel.innerHTML = "";
    var cur = CFG.booking.currency;
    (CFG.booking.objects || []).forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o.id;
      var unitLabel = o.unit === "night" ? t("services.perNight") : t("services.perHour");
      opt.textContent = t("booking.objects." + o.id) + " — " + o.pricePerUnit + " " + cur + " " + unitLabel;
      sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
  }

  function buildExtras() {
    var box = $("#bk-extras");
    if (!box) return;
    var checked = {};
    $$(".extra input", box).forEach(function (i) { checked[i.value] = i.checked; });
    box.innerHTML = "";
    var cur = CFG.booking.currency;
    (CFG.booking.extras || []).forEach(function (ex) {
      var id = "ex-" + ex.id;
      var label = document.createElement("label");
      label.className = "extra";
      label.htmlFor = id;
      // мангальная зона (bbq) — бесплатна, показываем ✓; остальные — "+N GEL"
      var priceTxt = ex.id === "bbq" ? "✓" : ("+" + ex.price + " " + cur);
      label.innerHTML =
        '<input type="checkbox" id="' + id + '" value="' + ex.id + '">' +
        '<span class="extra__name">' + t("booking.extras." + ex.id) + '</span>' +
        '<span class="extra__price">' + priceTxt + '</span>';
      var input = label.querySelector("input");
      if (checked[ex.id]) { input.checked = true; label.classList.add("is-on"); }
      input.addEventListener("change", function () {
        label.classList.toggle("is-on", input.checked);
        calcTotal();
      });
      box.appendChild(label);
    });
  }

  function clampGuests() {
    var el = getEl();
    if (!el.object || !el.guests) return;
    var obj = objectsById[el.object.value] || (CFG.booking.objects || [])[0];
    var max = obj ? obj.maxGuests : 12;
    el.guests.max = max;
    if (+el.guests.value > max) el.guests.value = max;
    if (+el.guests.value < 1) el.guests.value = 1;
  }

  function syncDuration(obj) {
    var el = getEl();
    if (!el.hours || !obj) return;
    var min = obj.minUnits || 1;
    el.hours.min = min;
    if ((+el.hours.value || 1) < min) el.hours.value = min;
  }

  function calcTotal() {
    var el = getEl();
    if (!el.object || !el.total) return 0;
    var obj = objectsById[el.object.value] || (CFG.booking.objects || [])[0];
    var hours = Math.max(obj ? (obj.minUnits || 1) : 1, +el.hours.value || 1);
    var guests = +el.guests.value || 1;
    var total = (obj ? obj.pricePerUnit : 0) * hours;

    // extras
    $$(".extra input:checked", el.extras).forEach(function (i) {
      var ex = (CFG.booking.extras || []).filter(function (e) { return e.id === i.value; })[0];
      if (ex) total += ex.perGuest ? ex.price * guests : ex.price;
    });

    // extra guests surcharge
    var base = obj ? obj.baseGuests : 0;
    var egp = CFG.booking.extraGuestPrice || 0;
    if (egp > 0 && guests > base) total += (guests - base) * egp * hours;

    el.total.textContent = total;
    return total;
  }

  function buildBookingMessage() {
    var el = getEl();
    var obj = objectsById[el.object.value];
    var cur = CFG.booking.currency;
    var isNight = obj && obj.unit === "night";
    var durLabel = isNight ? t("booking.msgNights") : t("booking.msgHours");
    var durUnit = isNight ? t("booking.nightsUnit") : t("booking.hoursUnit");
    var extras = $$(".extra input:checked", el.extras).map(function (i) {
      return t("booking.extras." + i.value);
    });
    var lines = [
      t("booking.msgIntro"),
      "• " + t("booking.msgObject") + ": " + t("booking.objects." + el.object.value),
      "• " + t("booking.msgDate") + ": " + (el.date.value || "—"),
      "• " + t("booking.msgTime") + ": " + (el.time.value || "—"),
      "• " + durLabel + ": " + el.hours.value + " " + durUnit,
      "• " + t("booking.msgGuests") + ": " + el.guests.value,
      "• " + t("booking.msgExtras") + ": " + (extras.length ? extras.join(", ") : "—"),
      "• " + t("booking.msgTotal") + ": ~" + calcTotal() + " " + cur
    ];
    if (el.name.value.trim()) lines.push("• " + t("booking.msgName") + ": " + el.name.value.trim());
    return lines.join("\n");
  }

  function toast(msg) {
    var el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = "position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:200;background:#241a12;color:#f4ebe0;border:1px solid rgba(243,233,221,.22);padding:.8rem 1.2rem;border-radius:999px;box-shadow:0 18px 50px -20px #000;font-weight:600;font-size:.9rem;max-width:90vw;text-align:center;opacity:0;transition:opacity .3s,transform .3s";
    document.body.appendChild(el);
    requestAnimationFrame(function(){ el.style.opacity="1"; el.style.transform="translateX(-50%) translateY(-6px)"; });
    setTimeout(function(){ el.style.opacity="0"; setTimeout(function(){ el.remove(); }, 400); }, 3200);
  }

  function send(channel) {
    var msg = buildBookingMessage();
    if (channel === "wa") {
      window.open(waLink(msg), "_blank", "noopener");
    } else if (channel === "tg") {
      // Telegram не поддерживает предзаполнение текста в чат — копируем в буфер и открываем чат
      var done = function () { toast(state.lang === "en" ? "Request copied — paste it in the chat" : state.lang === "ge" ? "ტექსტი დაკოპირდა — ჩასვით ჩატში" : "Текст заявки скопирован — вставьте в чат"); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(msg).then(done, function(){});
      }
      window.open(tgLink(), "_blank", "noopener");
    } else if (channel === "call") {
      window.location.href = telHref(CFG.contacts.phonePrimary);
    }
  }

  function initBooking() {
    buildObjectOptions();
    buildExtras();

    var el = getEl();
    if (!el.object) return;

    // min date = today
    if (el.date) {
      var d = new Date();
      el.date.min = d.toISOString().slice(0, 10);
      if (!el.date.value) el.date.value = el.date.min;
    }
    syncDuration(objectsById[el.object.value] || (CFG.booking.objects || [])[0]);

    el.object.addEventListener("change", function () { syncDuration(objectsById[el.object.value]); clampGuests(); calcTotal(); });

    // steppers
    $$(".stepper").forEach(function (st) {
      var input = $("input", st);
      $$(".stepper__btn", st).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var dir = +btn.dataset.dir;
          var min = +input.min || 1, max = +input.max || 99;
          var v = Math.min(max, Math.max(min, (+input.value || min) + dir));
          input.value = v;
          calcTotal();
        });
      });
    });

    // submit buttons
    $$("[data-send]").forEach(function (b) {
      b.addEventListener("click", function () { send(b.dataset.send); });
    });

    // service "book" buttons -> preset object + scroll
    $$("[data-book-object]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.bookObject;
        if (el.object) { el.object.value = id; syncDuration(objectsById[id]); clampGuests(); calcTotal(); }
      });
    });

    clampGuests();
    calcTotal();
  }

  /* fill service-card prices / currency / max guests from config */
  function applyServiceMeta() {
    var cur = CFG.booking.currency;
    $$("[data-price-object]").forEach(function (e) {
      var o = objectsById[e.dataset.priceObject];
      if (o) { e.textContent = o.pricePerUnit; e.dataset.cur = cur; }
    });
    $$("[data-unit-object]").forEach(function (e) {
      var o = objectsById[e.dataset.unitObject];
      if (o) e.textContent = o.unit === "night" ? t("services.perNight") : t("services.perHour");
    });
    $$("[data-max-object]").forEach(function (e) {
      var o = objectsById[e.dataset.maxObject];
      if (o) e.textContent = o.maxGuests;
    });
    $$("[data-currency]").forEach(function (e) { e.textContent = cur; });
  }

  /* ========================= i18n ========================= */
  function applyI18n(lang) {
    if (LANGS.indexOf(lang) === -1) lang = "ru";
    state.lang = lang;
    document.documentElement.lang = (lang === "ge" ? "ka" : lang);

    $$("[data-i18n]").forEach(function (e) {
      var v = t(e.getAttribute("data-i18n"));
      if (v) e.textContent = v;
    });
    $$("[data-i18n-ph]").forEach(function (e) {
      var v = t(e.getAttribute("data-i18n-ph"));
      if (v) e.setAttribute("placeholder", v);
    });
    // address (per-language)
    $$("[data-address]").forEach(function (e) { e.textContent = (CFG.contacts.address || {})[lang] || ""; });

    // rebuild dynamic translated bits
    buildObjectOptions();
    buildExtras();
    applyServiceMeta();
    refreshGenericCTAs();
    calcTotal();

    // active lang button
    $$(".lang__btn").forEach(function (b) { b.classList.toggle("is-active", b.dataset.lang === lang); });

    try { localStorage.setItem(LS_LANG, lang); } catch (e) {}
  }

  function initLang() {
    var saved = null;
    try { saved = localStorage.getItem(LS_LANG); } catch (e) {}
    var lang = saved;
    if (!lang) {
      var nav = (navigator.language || "ru").toLowerCase();
      lang = nav.indexOf("ka") === 0 ? "ge" : nav.indexOf("ru") === 0 ? "ru" : nav.indexOf("en") === 0 ? "en" : "ru";
    }
    $$(".lang__btn").forEach(function (b) {
      b.addEventListener("click", function () { applyI18n(b.dataset.lang); });
    });
    applyI18n(lang);
  }

  /* ========================= HEADER / NAV ========================= */
  function initHeader() {
    var header = $("#header"), burger = $("#burger"), nav = $("#nav");
    function onScroll() { header.classList.toggle("is-scrolled", window.scrollY > 10); }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    if (burger && nav) {
      burger.addEventListener("click", function () {
        var open = nav.classList.toggle("is-open");
        burger.setAttribute("aria-expanded", open ? "true" : "false");
      });
      $$("a", nav).forEach(function (a) {
        a.addEventListener("click", function () {
          nav.classList.remove("is-open");
          burger.setAttribute("aria-expanded", "false");
        });
      });
      window.addEventListener("resize", function () {
        if (window.innerWidth > 980) { nav.classList.remove("is-open"); burger.setAttribute("aria-expanded", "false"); }
      });
    }

    // to-top
    var toTop = $("#toTop");
    if (toTop) {
      window.addEventListener("scroll", function () { toTop.classList.toggle("is-visible", window.scrollY > 500); }, { passive: true });
      toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
    }
  }

  /* ========================= REVEAL ========================= */
  function initReveal() {
    var els = $$(".reveal");
    if (!("IntersectionObserver" in window) || !els.length) { els.forEach(function (e){ e.classList.add("is-in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ========================= GALLERY LIGHTBOX ========================= */
  function initGallery() {
    var items = $$(".gallery__item");
    if (!items.length) return;
    var srcs = items.map(function (b) { return b.dataset.src; });
    var lb = $("#lightbox"), img = $("#lbImg"), idx = 0;
    if (!lb) return;

    function open(i) { idx = (i + srcs.length) % srcs.length; img.src = srcs[idx]; lb.classList.add("is-open"); lb.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; }
    function close() { lb.classList.remove("is-open"); lb.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }

    items.forEach(function (b, i) { b.addEventListener("click", function () { open(i); }); });
    $("#lbClose").addEventListener("click", close);
    $("#lbPrev").addEventListener("click", function (e) { e.stopPropagation(); open(idx - 1); });
    $("#lbNext").addEventListener("click", function (e) { e.stopPropagation(); open(idx + 1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") open(idx - 1);
      else if (e.key === "ArrowRight") open(idx + 1);
    });
  }

  /* ========================= PROMO BAR + COUNTDOWN ========================= */
  function initPromo() {
    var bar = $("#promoBar");
    if (!bar || !CFG.promo || !CFG.promo.enabled) return;
    var dismissed = false;
    try { dismissed = localStorage.getItem(LS_PROMO) === "1"; } catch (e) {}
    if (dismissed) return;

    var end = CFG.promo.endsAt ? new Date(CFG.promo.endsAt.replace(" ", "T")) : null;
    var timerEl = $("#promoTimer");

    function tick() {
      if (!end) { if (timerEl) timerEl.style.display = "none"; return; }
      var diff = end - new Date();
      if (diff <= 0) { bar.hidden = true; return; }
      var d = Math.floor(diff / 86400000),
          h = Math.floor(diff / 3600000) % 24,
          m = Math.floor(diff / 60000) % 60,
          s = Math.floor(diff / 1000) % 60;
      if (timerEl) timerEl.textContent = (d > 0 ? d + t("promo.days") + " " : "") + pad(h) + ":" + pad(m) + ":" + pad(s);
    }
    function pad(n) { return (n < 10 ? "0" : "") + n; }

    bar.hidden = false;
    tick(); setInterval(tick, 1000);

    var close = $("#promoClose");
    if (close) close.addEventListener("click", function () {
      bar.hidden = true;
      try { localStorage.setItem(LS_PROMO, "1"); } catch (e) {}
    });
  }

  /* ========================= INIT ========================= */
  function init() {
    var y = $("#year"); if (y) y.textContent = new Date().getFullYear();
    applyContacts();
    applyServiceMeta();
    initBooking();
    initLang();        // applies i18n (also rebuilds options/extras)
    initHeader();
    initReveal();
    initGallery();
    initPromo();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
