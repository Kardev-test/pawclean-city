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
  async del(path) {
    const response = await fetch(path, {
      method: "DELETE",
      credentials: "same-origin",
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

const editorForm = document.querySelector("#adminEditorForm");
const editorFields = document.querySelector("#adminEditorFields");
const editorEmpty = document.querySelector("#adminEditorEmpty");
const editorMessage = document.querySelector("#adminEditorMessage");
const editorStamp = document.querySelector("#adminEditorStamp");
const editorDeleteButton = document.querySelector("#adminEditorDelete");
const editorCancelButton = document.querySelector("#adminEditorCancel");

const store = {
  donations: [],
  reports: [],
  volunteers: [],
  current: null,
};

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

function setEditorMessage(message, isError = false) {
  editorMessage.textContent = message;
  editorMessage.style.color = isError ? "#b54b3b" : "";
}

function clearEditor() {
  store.current = null;
  editorFields.innerHTML = "";
  editorForm.classList.add("hidden");
  editorEmpty.classList.remove("hidden");
  editorStamp.textContent = "Pick a record";
  setEditorMessage("Changes here update the live database immediately.");
}

function field(label, name, value, type = "text") {
  if (type === "textarea") {
    return `
      <label>
        ${escapeHtml(label)}
        <textarea name="${escapeHtml(name)}" rows="4">${escapeHtml(value || "")}</textarea>
      </label>
    `;
  }

  return `
    <label>
      ${escapeHtml(label)}
      <input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value || "")}" />
    </label>
  `;
}

function selectField(label, name, value, options) {
  return `
    <label>
      ${escapeHtml(label)}
      <select name="${escapeHtml(name)}">
        ${options
          .map(
            (option) =>
              `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`,
          )
          .join("")}
      </select>
    </label>
  `;
}

function openEditor(type, id) {
  const collection = store[`${type}s`];
  const record = collection.find((item) => item.id === id);
  if (!record) {
    setEditorMessage("Could not find that record.", true);
    return;
  }

  store.current = { type, id };
  editorStamp.textContent = `${type} selected`;
  editorForm.classList.remove("hidden");
  editorEmpty.classList.add("hidden");

  if (type === "donation") {
    editorFields.innerHTML = [
      field("Donor", "donor", record.donor),
      field("Amount", "amount", record.amount, "number"),
      selectField("Program", "program", record.program, ["stray-food", "medical", "clean-city", "general"]),
      field("Contact", "contact", record.contact),
      selectField("Status", "status", record.status, ["pledged", "payment_order_created", "paid"]),
    ].join("");
  }

  if (type === "report") {
    editorFields.innerHTML = [
      field("Type", "type", record.type),
      field("Location", "location", record.location),
      selectField("Urgency", "urgency", record.urgency, ["Normal", "High", "Emergency"]),
      selectField("Status", "status", record.status, ["open", "closed"]),
      field("Notes", "notes", record.notes, "textarea"),
    ].join("");
  }

  if (type === "volunteer") {
    editorFields.innerHTML = [
      field("Name", "name", record.name),
      field("Area", "area", record.area),
      selectField("Skill", "skill", record.skill, [
        "Feeding route",
        "Animal transport",
        "Cleanup drive",
        "Adoption event",
      ]),
    ].join("");
  }

  setEditorMessage(`Editing ${type} ${id.slice(0, 10)}...`);
}

function renderOverview(data) {
  showDashboard();
  store.donations = data.recent.donations;
  store.reports = data.recent.reports;
  store.volunteers = data.recent.volunteers;

  document.querySelector("#adminFunds").textContent = rupee.format(data.metrics.totalFunds || 0);
  document.querySelector("#adminDonations").textContent = String(data.metrics.donationsCount || 0);
  document.querySelector("#adminOpenReports").textContent = String(data.metrics.openReports || 0);
  document.querySelector("#adminVolunteerCount").textContent = String(data.metrics.volunteersCount || 0);
  document.querySelector("#adminFundingMixLabel").textContent = `${data.metrics.donationsCount || 0} entries`;
  document.querySelector("#adminUrgencyLabel").textContent = `${data.metrics.openReports || 0} open`;

  const fundingMix = document.querySelector("#adminFundingMix");
  fundingMix.innerHTML =
    Object.entries(data.programTotals)
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
          <div class="report-actions">
            <button class="report-status" data-edit-type="donation" data-edit-id="${escapeHtml(item.id)}" type="button">Edit</button>
            <button class="report-status" data-delete-type="donation" data-delete-id="${escapeHtml(item.id)}" type="button">Delete</button>
          </div>
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
            <button class="report-status" data-edit-type="report" data-edit-id="${escapeHtml(item.id)}" type="button">Edit</button>
            <button class="report-status" data-delete-type="report" data-delete-id="${escapeHtml(item.id)}" type="button">Delete</button>
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
          <div class="report-actions">
            <button class="report-status" data-edit-type="volunteer" data-edit-id="${escapeHtml(item.id)}" type="button">Edit</button>
            <button class="report-status" data-delete-type="volunteer" data-delete-id="${escapeHtml(item.id)}" type="button">Delete</button>
          </div>
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

async function saveCurrentRecord(formData) {
  if (!store.current) return;
  const { type, id } = store.current;

  if (type === "donation") {
    await adminApi.patch(`/api/admin/donations/${id}`, {
      donor: formData.get("donor"),
      amount: Number(formData.get("amount")),
      program: formData.get("program"),
      contact: formData.get("contact"),
      status: formData.get("status"),
    });
  }

  if (type === "report") {
    await adminApi.patch(`/api/admin/reports/${id}`, {
      type: formData.get("type"),
      location: formData.get("location"),
      urgency: formData.get("urgency"),
      notes: formData.get("notes"),
      status: formData.get("status"),
    });
  }

  if (type === "volunteer") {
    await adminApi.patch(`/api/admin/volunteers/${id}`, {
      name: formData.get("name"),
      area: formData.get("area"),
      skill: formData.get("skill"),
    });
  }
}

async function deleteCurrentRecord() {
  if (!store.current) return;
  const { type, id } = store.current;
  await adminApi.del(`/api/admin/${type}s/${id}`);
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
  clearEditor();
  showLogin("Signed out.");
});

editorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveCurrentRecord(new FormData(editorForm));
    setEditorMessage("Saved successfully.");
    await loadAdminOverview();
  } catch (error) {
    setEditorMessage(error.message, true);
  }
});

editorDeleteButton.addEventListener("click", async () => {
  if (!store.current) return;
  const confirmed = window.confirm("Delete this record permanently?");
  if (!confirmed) return;

  try {
    await deleteCurrentRecord();
    clearEditor();
    await loadAdminOverview();
    setEditorMessage("Record deleted.");
  } catch (error) {
    setEditorMessage(error.message, true);
  }
});

editorCancelButton.addEventListener("click", () => clearEditor());

dashboardView.addEventListener("click", async (event) => {
  const reportStatusButton = event.target.closest("[data-report-id]");
  const editButton = event.target.closest("[data-edit-id]");
  const deleteButton = event.target.closest("[data-delete-id]");

  if (reportStatusButton) {
    reportStatusButton.disabled = true;
    try {
      const report = store.reports.find((item) => item.id === reportStatusButton.dataset.reportId);
      if (!report) throw new Error("Report not found.");
      await adminApi.patch(`/api/admin/reports/${report.id}`, {
        type: report.type,
        location: report.location,
        urgency: report.urgency,
        notes: report.notes,
        status: reportStatusButton.dataset.status,
      });
      await loadAdminOverview();
    } catch (error) {
      setEditorMessage(error.message, true);
    } finally {
      reportStatusButton.disabled = false;
    }
    return;
  }

  if (editButton) {
    openEditor(editButton.dataset.editType, editButton.dataset.editId);
    return;
  }

  if (deleteButton) {
    openEditor(deleteButton.dataset.deleteType, deleteButton.dataset.deleteId);
    editorDeleteButton.click();
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
