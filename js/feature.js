/* Featured-event banner (home + events page): image left blurring into details, countdown, CTA */
(function () {
  const { icon, esc, fmt, fmtDate, fmtTime, poster, minPrice } = RR;
  RR.renderFeature = function (host, e, cta = "View Event") {
    if (!host || !e) return;
    host.innerHTML = `<div class="feature">
      <a class="feature-media" href="event.html?id=${e.id}" aria-label="${esc(e.title)}">${poster(e, "lg")}<span class="blur-edge"></span></a>
      <div class="feature-body">
        <span class="glow purple" style="width:260px;height:260px;right:-60px;top:-60px;opacity:.25"></span>
        <div><span class="pill">Featured event</span></div>
        <h3 class="h2" style="position:relative">${esc(e.title)}</h3>
        <div class="chips">
          <span class="chip">${icon("pin")} ${esc(e.venue)}, ${esc(e.city)}</span>
          <span class="chip">${icon("cal")} ${esc(fmtDate(e.date))}</span>
          <span class="chip">${icon("clock")} ${esc(fmtTime(e.date))}</span>
        </div>
        <p class="muted" style="position:relative">${esc(e.desc)}</p>
        <div class="countdown" data-cd="${e.date}"></div>
        <div class="feature-foot">
          <div class="from">From <b>${fmt(minPrice(e))}</b></div>
          <a class="btn btn-primary btn-lg" href="event.html?id=${e.id}">${esc(cta)} ${icon("arrow")}</a>
        </div>
      </div>
    </div>`;
    const cd = host.querySelector("[data-cd]");
    const tick = () => {
      let s = Math.max(0, Math.floor((new Date(e.date) - new Date()) / 1000));
      const d = Math.floor(s / 86400); s %= 86400;
      const h = Math.floor(s / 3600); s %= 3600;
      const m = Math.floor(s / 60);
      cd.innerHTML = [[d, "Days"], [h, "Hrs"], [m, "Mins"]].map(([v, l]) => `<div><b>${String(v).padStart(2, "0")}</b><span>${l}</span></div>`).join("");
    };
    tick(); setInterval(tick, 30000);
  };
})();
