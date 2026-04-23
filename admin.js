const rupee = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const adminApi = {
  async get(path) {
    const response = await fetch(path, { credentials: "same-origin" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  },
  async post(path, body) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  },
  async patch(path, body) {
    const response = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  },
};

const loginView = document.querySelector("#adminLoginView");
const dashboardView = document.querySelector("#adminDashboardView");
const loginForm = document.querySelector("#adminLoginForm");
const loginMessage = document.querySelector("#adminLoginMessage");
const refreshButton = document.querySelector("#adminRefresh");
const logoutButton = document.querySelector("#adminLogout");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "Just now";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function showLogin(message = "Only authorized NGO operators should use this area.") {
  loginMessage.textContent = message;
  loginView.classList.remove("hidden");
  dashboardView.classList.add("hidden");
}

function showDashboard() {
  loginView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
}

function renderOverview(data) {
  showDashboard();

  document.querySelector("#adminFunds").textContent = rupee.format(data.metrics.totalFunds || 0);
  document.querySelector("#adminDonations").textContent = String(data.metrics.donationsCount || 0);
  document.querySelector("#adminOpenReports").textContent = String(data.metrics.openReports || 0);
  document.querySelector("#adminVolunteerCount").textContent = String(data.metrics.volunteersCount || 0);
  document.querySelector("#adminFundingMixLabel").textContent = `${data.metrics.donationsCount || 0} entries`;
  document.querySelector("#adminUrgencyLabel").textContent = `${data.metrics.openReports || 0} open`;

  const fundingMix = document.querySelector("#adminFundingMix");
  fundingMix.innerHTML = Object.entries(data.programTotals)
    .map(([key, amount]) => {
      const total = Math.max(data.metrics.totalFunds || 1, 1);
      const width = Math.max(8, Math.round((amount / total) * 100));
      return `
        <div>
          <span style="--w: ${width}%"></span>
          <b>${escapeHtml(programLabel(key))}</b>
          <em>${rupee.format(amount)}</em>
        </div>
      `;
    })
    .join("") || '<p class="empty">No funding data yet.</p>';

  const urgencyQueue = document.querySelector("#adminUrgencyQueue");
  urgencyQueue.innerHTML = ["Emergency", "High", "Normal"]
    .map((level) => {
      const count = data.urgencyCounts[level] || 0;
      return `
        <div class="urgency-card">
          <span class="activity-subtle">${level}</span>
          <strong>${count}</strong>
          <span class="badge ${level.toLowerCase()}">${count ? "active" : "clear"}</span>
        </div>
      `;
    })
    .join("");

  document.querySelector("#adminDonationList").innerHTML = renderDonationList(data.recent.donations);
  document.querySelector("#adminReportList").innerHTML = renderReportList(data.recent.reports);
  document.querySelector("#adminVolunteerList").innerHTML = renderVolunteerList(data.recent.volunteers);
}

function renderDonationList(items) {
  if (!items.length) return '<p class="empty">No donations yet.</p>';
  return items
    .map(
      (item) => `
        <article class="activity-item">
          <div class="activity-top">
            <strong>${escapeHtml(item.donor)}</strong>
            <span class="badge ${item.status === "paid" ? "closed" : "normal"}">${escapeHtml(item.status)}</span>
          </div>
          <p>${rupee.format(item.amount)} for ${escapeHtml(programLabel(item.program))}</p>
          <p class="activity-meta">${escapeHtml(item.contact || "No contact")} · ${escapeHtml(formatDate(item.createdAt))}</p>
        </article>
      `,
    )
    .join("");
}

function renderReportList(items) {
  if (!items.length) return '<p class="empty">No field reports yet.</p>';
  return items
    .map(
      (item) => `
        <article class="activity-item">
          <div class="activity-top">
            <strong>${escapeHtml(item.type)}</strong>
            <span class="badge ${escapeHtml(item.urgency.toLowerCase())}">${escapeHtml(item.urgency)}</span>
          </div>
          <p>${escapeHtml(item.location)} · ${escapeHtml(item.notes || "No notes")}</p>
          <div class="report-actions">
            <button class="report-status ${item.status === "open" ? "active" : ""}" data-report-id="${escapeHtml(item.id)}" data-status="open" type="button">Open</button>
            <button class="report-status ${item.status === "closed" ? "active" : ""}" data-report-id="${escapeHtml(item.id)}" data-status="closed" type="button">Closed</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderVolunteerList(items) {
  if (!items.length) return '<p class="empty">No volunteers yet.</p>';
  return items
    .map(
      (item) => `
        <article class="activity-item">
          <div class="activity-top">
            <strong>${escapeHtml(item.name)}</strong>
            <span class="badge closed">ready</span>
          </div>
          <p>${escapeHtml(item.skill)} · ${escapeHtml(item.area)}</p>
          <p class="activity-meta">${escapeHtml(formatDate(item.createdAt))}</p>
        </article>
      `,
    )
    .join("");
}

function programLabel(key) {
  const names = {
    "stray-food": "Stray dog and cat feeding",
    medical: "Rescue, vaccination, and sterilization",
    "clean-city": "Waste pickup and city cleanliness",
    general: "Where it is needed most",
  };
  return names[key] || key;
}

async function loadAdminOverview() {
  const data = await adminApi.get("/api/admin/overview");
  renderOverview(data);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#adminEmail").value.trim();
  const password = document.querySelector("#adminPassword").value;

  try {
    await adminApi.post("/api/admin/login", { email, password });
    loginForm.reset();
    await loadAdminOverview();
  } catch (error) {
    showLogin(error.message);
  }
});

refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  try {
    await loadAdminOverview();
  } catch (error) {
    showLogin(error.message);
  } finally {
    refreshButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await adminApi.post("/api/admin/logout", {});
  } catch {
    // ignore logout failures and return to login anyway
  }
  showLogin("Signed out.");
});

dashboardView.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-report-id]");
  if (!button) return;

  button.disabled = true;
  try {
    await adminApi.patch(`/api/admin/reports/${button.dataset.reportId}`, {
      status: button.dataset.status,
    });
    await loadAdminOverview();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});

adminApi
  .get("/api/admin/session")
  .then((data) => {
    if (data.authenticated) {
      return loadAdminOverview();
    }
    showLogin();
    return null;
  })
  .catch(() => showLogin());
