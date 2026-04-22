const rupee = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const api = {
  available: location.protocol !== "file:",
  async get(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
  },
  async post(path, body) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  },
  async del(path) {
    const response = await fetch(path, { method: "DELETE" });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
  },
};

const storageKeys = {
  donations: "pawclean_donations",
  reports: "pawclean_reports",
  volunteers: "pawclean_volunteers",
};

const state = {
  donations: [],
  reports: [],
  volunteers: [],
};

const programNames = {
  "stray-food": "Stray dog and cat feeding",
  medical: "Rescue, vaccination, and sterilization",
  "clean-city": "Waste pickup and city cleanliness",
  general: "Where it is needed most",
};

const donationAmount = document.querySelector("#donationAmount");
const amountButtons = document.querySelectorAll("[data-amount]");
const donationForm = document.querySelector("#donationForm");
const reportForm = document.querySelector("#reportForm");
const volunteerForm = document.querySelector("#volunteerForm");
const reportList = document.querySelector("#reportList");
const volunteerList = document.querySelector("#volunteerList");

function fallbackLoad() {
  state.donations = JSON.parse(localStorage.getItem(storageKeys.donations) || "[]");
  state.reports = JSON.parse(localStorage.getItem(storageKeys.reports) || "[]");
  state.volunteers = JSON.parse(localStorage.getItem(storageKeys.volunteers) || "[]");
}

function fallbackSave() {
  localStorage.setItem(storageKeys.donations, JSON.stringify(state.donations));
  localStorage.setItem(storageKeys.reports, JSON.stringify(state.reports));
  localStorage.setItem(storageKeys.volunteers, JSON.stringify(state.volunteers));
}

async function loadData() {
  if (!api.available) {
    fallbackLoad();
    return;
  }

  try {
    const data = await api.get("/api/summary");
    state.donations = data.donations || [];
    state.reports = data.reports || [];
    state.volunteers = data.volunteers || [];
  } catch (error) {
    console.warn(error);
    fallbackLoad();
    api.available = false;
  }
}

function allocation(amount) {
  return {
    food: Math.round(amount * 0.4),
    medical: Math.round(amount * 0.25),
    clean: Math.round(amount * 0.25),
    admin: amount - Math.round(amount * 0.4) - Math.round(amount * 0.25) - Math.round(amount * 0.25),
  };
}

function updateDonationPreview() {
  const amount = Math.max(Number(donationAmount.value) || 0, 0);
  const split = allocation(amount);
  document.querySelector("#impactAmount").textContent = rupee.format(amount);
  document.querySelector("#foodValue").textContent = rupee.format(split.food);
  document.querySelector("#medicalValue").textContent = rupee.format(split.medical);
  document.querySelector("#cleanValue").textContent = rupee.format(split.clean);
  document.querySelector("#adminValue").textContent = rupee.format(split.admin);
}

function updateTotals() {
  const total = state.donations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const reportsOpen = state.reports.length;
  document.querySelector("#heroFunds").textContent = rupee.format(total);
  document.querySelector("#totalFunds").textContent = rupee.format(total);
  document.querySelector("#heroReports").textContent = reportsOpen;
  document.querySelector("#totalMeals").textContent = Math.floor((total * 0.4) / 25).toLocaleString("en-IN");
  document.querySelector("#totalCleanups").textContent = Math.floor((total * 0.25) / 150).toLocaleString("en-IN");
  document.querySelector("#totalCare").textContent = Math.floor((total * 0.25) / 500).toLocaleString("en-IN");
}

function renderReports() {
  if (!state.reports.length) {
    reportList.innerHTML = '<p class="empty">No reports yet. Submitted cases will appear here for field triage.</p>';
    return;
  }

  reportList.innerHTML = state.reports
    .map((report) => {
      const urgencyClass = report.urgency === "Emergency" || report.urgency === "High" ? "high" : "normal";
      return `
        <article class="report-card">
          <header>
            <strong>${escapeHtml(report.type)}</strong>
            <span class="badge ${urgencyClass}">${escapeHtml(report.urgency)}</span>
          </header>
          <p><b>${escapeHtml(report.location)}</b></p>
          <p>${escapeHtml(report.notes || "No extra notes added.")}</p>
        </article>
      `;
    })
    .join("");
}

function renderVolunteers() {
  if (!state.volunteers.length) {
    volunteerList.innerHTML = '<p class="empty">No volunteers registered yet.</p>';
    return;
  }

  volunteerList.innerHTML = state.volunteers
    .map(
      (person) => `
        <div class="volunteer-pill">
          <strong>${escapeHtml(person.name)}</strong>
          <span>${escapeHtml(person.skill)} - ${escapeHtml(person.area)}</span>
        </div>
      `,
    )
    .join("");
}

function renderAll() {
  updateDonationPreview();
  renderReports();
  renderVolunteers();
  updateTotals();
}

function setStatus(message, type = "info") {
  const receiptBox = document.querySelector("#receiptBox");
  receiptBox.dataset.type = type;
  receiptBox.innerHTML = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

amountButtons.forEach((button) => {
  button.addEventListener("click", () => {
    amountButtons.forEach((item) => item.classList.remove("selected"));
    button.classList.add("selected");
    donationAmount.value = button.dataset.amount;
    updateDonationPreview();
  });
});

donationAmount.addEventListener("input", () => {
  amountButtons.forEach((item) => {
    item.classList.toggle("selected", item.dataset.amount === donationAmount.value);
  });
  updateDonationPreview();
});

donationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const amount = Math.max(Number(donationAmount.value) || 0, 0);
  const donor = document.querySelector("#donorName").value.trim();
  const program = document.querySelector("#program").value;

  if (!donor || amount < 50) return;

  const payload = {
    donor,
    amount,
    program,
    contact: document.querySelector("#donorContact").value.trim(),
  };

  try {
    if (api.available) {
      const result = await api.post("/api/donations", payload);
      state.donations.unshift(result.donation);
      if (result.payment?.provider === "razorpay") {
        openRazorpayCheckout(result.payment, result.donation, payload);
      } else {
        setStatus(
          `<h3>Pledge recorded</h3>
           <p>${escapeHtml(donor)} pledged <b>${rupee.format(amount)}</b> for ${programNames[program]}.</p>
           <p>Add Razorpay keys on the server to collect real online payments.</p>`,
          "success",
        );
      }
    } else {
      const record = { ...payload, id: `local-${Date.now()}`, createdAt: new Date().toISOString(), status: "pledged" };
      state.donations.unshift(record);
      fallbackSave();
      setStatus(
        `<h3>Local pledge recorded</h3>
         <p>${escapeHtml(donor)} pledged <b>${rupee.format(amount)}</b>. Start the Node server to save it centrally.</p>`,
        "success",
      );
    }

    donationForm.reset();
    donationAmount.value = 500;
    amountButtons.forEach((item) => item.classList.toggle("selected", item.dataset.amount === "500"));
    renderAll();
  } catch (error) {
    setStatus(`<h3>Donation could not be saved</h3><p>${escapeHtml(error.message)}</p>`, "error");
  }
});

reportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    type: document.querySelector("#reportType").value,
    location: document.querySelector("#reportLocation").value.trim(),
    urgency: document.querySelector("#reportUrgency").value,
    notes: document.querySelector("#reportNotes").value.trim(),
  };

  try {
    if (api.available) {
      const result = await api.post("/api/reports", payload);
      state.reports.unshift(result.report);
    } else {
      state.reports.unshift({ ...payload, id: `local-${Date.now()}`, createdAt: new Date().toISOString() });
      fallbackSave();
    }
    reportForm.reset();
    renderAll();
  } catch (error) {
    alert(error.message);
  }
});

document.querySelector("#clearReports").addEventListener("click", async () => {
  try {
    if (api.available) {
      await api.del("/api/reports");
    }
    state.reports = [];
    fallbackSave();
    renderAll();
  } catch (error) {
    alert(error.message);
  }
});

volunteerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    name: document.querySelector("#volunteerName").value.trim(),
    area: document.querySelector("#volunteerArea").value.trim(),
    skill: document.querySelector("#volunteerSkill").value,
  };

  try {
    if (api.available) {
      const result = await api.post("/api/volunteers", payload);
      state.volunteers.unshift(result.volunteer);
    } else {
      state.volunteers.unshift({ ...payload, id: `local-${Date.now()}`, createdAt: new Date().toISOString() });
      fallbackSave();
    }
    volunteerForm.reset();
    renderAll();
  } catch (error) {
    alert(error.message);
  }
});

loadData().then(renderAll);

function openRazorpayCheckout(payment, donation, payload) {
  if (!window.Razorpay) {
    setStatus(
      `<h3>Payment order created</h3>
       <p>Razorpay Checkout could not load. Order ID: ${escapeHtml(payment.orderId)}</p>`,
      "error",
    );
    return;
  }

  const checkout = new window.Razorpay({
    key: payment.keyId,
    amount: payment.amount,
    currency: payment.currency,
    name: "PawClean City NGO",
    description: programNames[donation.program] || "Donation",
    order_id: payment.orderId,
    prefill: {
      name: payload.donor,
      email: payload.contact.includes("@") ? payload.contact : "",
      contact: payload.contact.includes("@") ? "" : payload.contact,
    },
    notes: {
      donation_id: donation.id,
      program: donation.program,
    },
    theme: {
      color: "#1d7a58",
    },
    handler: async (response) => {
      try {
        const result = await api.post("/api/payments/razorpay/verify", response);
        const index = state.donations.findIndex((item) => item.id === result.donation.id);
        if (index >= 0) state.donations[index] = result.donation;
        setStatus(
          `<h3>Payment received</h3>
           <p>Thank you, ${escapeHtml(payload.donor)}. Your ${rupee.format(donation.amount)} donation is marked paid.</p>
           <p>Payment ID: ${escapeHtml(result.donation.paymentId)}</p>`,
          "success",
        );
        renderAll();
      } catch (error) {
        setStatus(`<h3>Payment needs review</h3><p>${escapeHtml(error.message)}</p>`, "error");
      }
    },
  });

  checkout.on("payment.failed", (response) => {
    setStatus(
      `<h3>Payment failed</h3>
       <p>${escapeHtml(response.error?.description || "The payment was not completed.")}</p>`,
      "error",
    );
  });

  checkout.open();
}
