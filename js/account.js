/* Shared bits for account pages (profile, tickets) */
(function () {
  const { icon, $ } = RR;
  RR.accountNav = (active) => `<aside class="panel" style="padding:12px">
    <nav class="side-nav">
      <a href="profile.html" class="${active === "profile" ? "active" : ""}">${icon("user")} My Profile</a>
      <a href="tickets.html" class="${active === "tickets" ? "active" : ""}">${icon("ticket")} My Tickets</a>
      <a href="events.html">${icon("cal")} Browse events</a>
      <a href="merch.html">${icon("bag")} Shop merch</a>
      <div class="dd-sep"></div>
      <button class="danger" data-acct-logout>${icon("logout")} Log out</button>
    </nav></aside>`;
  RR.wireAccountNav = () => { const b = $("[data-acct-logout]"); if (b) b.addEventListener("click", RR.logout); };
  RR.signedOut = (root, title) => {
    root.innerHTML = `<div class="empty"><div class="em-ic">${icon("lock")}</div><h2>${title}</h2>
      <p>Log in or create a free account. Bought tickets as a guest? Sign up with the same email and they'll show up here.</p>
      <div class="actions"><button class="btn btn-primary" data-a="login">Log in</button><button class="btn btn-ghost" data-a="signup">Sign up</button></div></div>`;
    root.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => RR.openAuth(b.dataset.a)));
  };
})();
