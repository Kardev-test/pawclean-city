const rupee = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const api = {
  available: location.protocol !== "file:",
  async get(path) {
    const response = await fetch(path, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
  },
  async post(path, body) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
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
const recentDonations = document.querySelector("#recentDonations");
const recentReports = document.querySelector("#recentReports");
const recentVolunteers = document.querySelector("#recentVolunteers");
const heroSceneTitle = document.querySelector("#heroSceneTitle");
const heroSceneText = document.querySelector("#heroSceneText");

const animatedCounters = new Map();

const sceneModes = {
  feeding: {
    title: "Feeding route in motion",
    text: "Volunteers circulate through clean street corners, refill bowls, and keep animal care visible.",
  },
  cleanup: {
    title: "Cleanup drive in action",
    text: "The waste station glows, bins shift into focus, and the route tightens around cleaner streets.",
  },
  rescue: {
    title: "Rescue watch engaged",
    text: "The camera narrows in, the animals bunch closer, and the volunteer patrol becomes more alert.",
  },
};

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
  const reportsOpen = state.reports.filter((item) => item.status !== "closed").length;
  const volunteerCount = state.volunteers.length;

  animateValue("#heroFunds", total, (value) => rupee.format(value));
  animateValue("#totalFunds", total, (value) => rupee.format(value));
  animateValue("#heroReports", reportsOpen, (value) => String(value));
  animateValue("#heroVolunteers", volunteerCount, (value) => String(value));
  animateValue("#totalMeals", Math.floor((total * 0.4) / 25), (value) => value.toLocaleString("en-IN"));
  animateValue("#totalCleanups", Math.floor((total * 0.25) / 150), (value) => value.toLocaleString("en-IN"));
  animateValue("#totalCare", Math.floor((total * 0.25) / 500), (value) => value.toLocaleString("en-IN"));
  document.querySelector("#donationCountChip").textContent = `${state.donations.length} entries`;
  document.querySelector("#reportCountChip").textContent = `${reportsOpen} open`;
  document.querySelector("#volunteerCountChip").textContent = `${volunteerCount} people`;
}

function renderReports() {
  if (!state.reports.length) {
    reportList.innerHTML = '<p class="empty">No reports yet. Submitted cases will appear here for field triage.</p>';
    return;
  }

  reportList.innerHTML = state.reports
    .slice(0, 8)
    .map((report) => {
      const urgencyClass = report.urgency === "Emergency" || report.urgency === "High" ? "high" : "normal";
      return `
        <article class="report-card">
          <header>
            <strong>${escapeHtml(report.type)}</strong>
            <span class="badge ${urgencyClass.toLowerCase()}">${escapeHtml(report.urgency)}</span>
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
    .slice(0, 6)
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

function renderPulse() {
  recentDonations.innerHTML = renderActivityItems(
    state.donations.slice(0, 5).map((item) => ({
      title: item.donor,
      badge: item.status || "pledged",
      badgeClass: item.status === "paid" ? "closed" : "normal",
      primary: `${rupee.format(item.amount)} for ${programNames[item.program] || item.program}`,
      secondary: formatDate(item.createdAt),
    })),
    "No donations yet.",
  );

  recentReports.innerHTML = renderActivityItems(
    state.reports.slice(0, 5).map((item) => ({
      title: item.type,
      badge: item.urgency,
      badgeClass: item.urgency.toLowerCase(),
      primary: item.location,
      secondary: item.status === "closed" ? "Closed" : "Needs attention",
    })),
    "No cases in the queue.",
  );

  recentVolunteers.innerHTML = renderActivityItems(
    state.volunteers.slice(0, 5).map((item) => ({
      title: item.name,
      badge: "ready",
      badgeClass: "closed",
      primary: `${item.skill} in ${item.area}`,
      secondary: formatDate(item.createdAt),
    })),
    "No volunteer signups yet.",
  );
}

function renderActivityItems(items, emptyMessage) {
  if (!items.length) return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;

  return items
    .map(
      (item) => `
        <article class="activity-item">
          <div class="activity-top">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="badge ${escapeHtml(item.badgeClass || "normal")}">${escapeHtml(item.badge)}</span>
          </div>
          <p>${escapeHtml(item.primary)}</p>
          <p class="activity-meta">${escapeHtml(item.secondary)}</p>
        </article>
      `,
    )
    .join("");
}

function renderAll() {
  updateDonationPreview();
  renderReports();
  renderVolunteers();
  renderPulse();
  updateTotals();
}

function animateValue(selector, target, formatter) {
  const element = document.querySelector(selector);
  if (!element) return;
  const start = animatedCounters.get(selector) ?? 0;
  const from = Number.isFinite(start) ? start : 0;
  const to = Number.isFinite(target) ? target : 0;
  const startedAt = performance.now();
  const duration = 700;

  function step(now) {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(from + (to - from) * eased);
    element.textContent = formatter(value);
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      animatedCounters.set(selector, to);
    }
  }

  requestAnimationFrame(step);
}

function initRevealMotion() {
  const revealTargets = document.querySelectorAll(
    "section, .feature, .panel, .metric, .activity-item, .report-card, .volunteer-pill",
  );
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 },
  );

  revealTargets.forEach((node) => {
    if (node.classList.contains("hero-stage")) return;
    node.classList.add("reveal");
    observer.observe(node);
  });
}

function initHeroScene() {
  const stage = document.querySelector("#heroStage");
  if (!stage || !window.THREE) return;

  const scene = new window.THREE.Scene();
  scene.fog = new window.THREE.Fog(0x10231f, 16, 42);

  const camera = new window.THREE.PerspectiveCamera(38, stage.clientWidth / stage.clientHeight, 0.1, 100);
  camera.position.set(0, 5.4, 15);

  const renderer = new window.THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  renderer.outputColorSpace = window.THREE.SRGBColorSpace;
  renderer.toneMapping = window.THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  stage.appendChild(renderer.domElement);

  const ambient = new window.THREE.HemisphereLight(0xfff7dc, 0x1b3129, 1.8);
  scene.add(ambient);

  const sun = new window.THREE.DirectionalLight(0xffefd6, 2.6);
  sun.position.set(8, 12, 6);
  scene.add(sun);

  const fill = new window.THREE.PointLight(0x6ac4ff, 16, 30, 2);
  fill.position.set(-8, 5, -2);
  scene.add(fill);

  const ground = new window.THREE.Mesh(
    new window.THREE.CylinderGeometry(10, 14, 1.8, 56),
    new window.THREE.MeshStandardMaterial({ color: 0x567666, roughness: 0.95, metalness: 0.02 }),
  );
  ground.position.set(0, -1.1, 0);
  scene.add(ground);

  const lane = new window.THREE.Mesh(
    new window.THREE.TorusGeometry(5.4, 0.6, 18, 100),
    new window.THREE.MeshStandardMaterial({ color: 0x9a8f7a, roughness: 1, metalness: 0.04 }),
  );
  lane.rotation.x = Math.PI / 2;
  lane.position.y = -0.1;
  scene.add(lane);

  const grassRing = new window.THREE.Mesh(
    new window.THREE.TorusGeometry(7.4, 1.6, 20, 90),
    new window.THREE.MeshStandardMaterial({ color: 0x315848, roughness: 1 }),
  );
  grassRing.rotation.x = Math.PI / 2;
  grassRing.position.y = -0.45;
  scene.add(grassRing);

  const scanRing = new window.THREE.Mesh(
    new window.THREE.TorusGeometry(6.55, 0.08, 12, 120),
    new window.THREE.MeshBasicMaterial({ color: 0x78d7ff, transparent: true, opacity: 0.45 }),
  );
  scanRing.rotation.x = Math.PI / 2;
  scanRing.position.y = 0.04;
  scene.add(scanRing);

  const innerRing = new window.THREE.Mesh(
    new window.THREE.TorusGeometry(4.2, 0.05, 10, 90),
    new window.THREE.MeshBasicMaterial({ color: 0xffd27d, transparent: true, opacity: 0.35 }),
  );
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = 0.06;
  scene.add(innerRing);

  const skylineMaterial = new window.THREE.MeshStandardMaterial({
    color: 0x2d4a46,
    emissive: 0x0b1514,
    roughness: 0.78,
    metalness: 0.25,
  });
  const towerGeometry = new window.THREE.BoxGeometry(0.55, 1, 0.55);
  const towerCount = 30;
  const skyline = new window.THREE.InstancedMesh(towerGeometry, skylineMaterial, towerCount);
  skyline.instanceMatrix.setUsage(window.THREE.DynamicDrawUsage);
  scene.add(skyline);

  const towerData = Array.from({ length: towerCount }, (_, index) => {
    const angle = (index / towerCount) * Math.PI * 2;
    return {
      radius: 7.4 + Math.sin(index * 2.1) * 0.55,
      height: 2.2 + ((index % 5) * 0.85),
      angle,
      drift: Math.random() * Math.PI * 2,
    };
  });

  const gridLines = new window.THREE.Group();
  for (let i = 0; i < 6; i += 1) {
    const radius = 2.4 + i * 1.1;
    const ring = new window.THREE.Mesh(
      new window.THREE.TorusGeometry(radius, 0.016, 8, 80),
      new window.THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x6bcaf5 : 0x8ff0b4,
        transparent: true,
        opacity: 0.16,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02 + i * 0.01;
    gridLines.add(ring);
  }
  scene.add(gridLines);

  function makeTree(x, z, scale = 1) {
    const tree = new window.THREE.Group();
    const trunk = new window.THREE.Mesh(
      new window.THREE.CylinderGeometry(0.18 * scale, 0.25 * scale, 2.2 * scale, 10),
      new window.THREE.MeshStandardMaterial({ color: 0x684b33, roughness: 1 }),
    );
    trunk.position.y = 1.1 * scale;
    const crown = new window.THREE.Mesh(
      new window.THREE.SphereGeometry(1.2 * scale, 18, 18),
      new window.THREE.MeshStandardMaterial({ color: 0x4d7b4f, roughness: 0.85 }),
    );
    crown.position.y = 2.6 * scale;
    tree.add(trunk, crown);
    tree.position.set(x, 0, z);
    return tree;
  }

  scene.add(makeTree(-5.8, -2.4, 1.05));
  scene.add(makeTree(6.2, -3.2, 0.9));
  scene.add(makeTree(-6.8, 3.8, 0.8));

  function roundedMaterial(color) {
    return new window.THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08 });
  }

  function createVolunteer() {
    const group = new window.THREE.Group();
    const shirt = new window.THREE.Mesh(new window.THREE.CapsuleGeometry(0.48, 1.3, 8, 16), roundedMaterial(0xf4f0e5));
    shirt.position.y = 1.9;
    const head = new window.THREE.Mesh(new window.THREE.SphereGeometry(0.36, 18, 18), roundedMaterial(0xd4a074));
    head.position.y = 3.05;

    const legLeft = new window.THREE.Mesh(new window.THREE.CapsuleGeometry(0.16, 0.95, 6, 12), roundedMaterial(0x2f5b8d));
    legLeft.position.set(-0.23, 0.78, 0);
    const legRight = legLeft.clone();
    legRight.position.x = 0.23;

    const armLeft = new window.THREE.Mesh(new window.THREE.CapsuleGeometry(0.12, 0.85, 6, 12), roundedMaterial(0xd4a074));
    armLeft.position.set(-0.72, 2.2, 0);
    armLeft.rotation.z = 0.55;
    const armRight = armLeft.clone();
    armRight.position.x = 0.72;
    armRight.rotation.z = -0.45;

    group.add(shirt, head, legLeft, legRight, armLeft, armRight);
    group.userData = { legLeft, legRight, armLeft, armRight };
    return group;
  }

  function createDog(color = 0xd3b172) {
    const group = new window.THREE.Group();
    const body = new window.THREE.Mesh(new window.THREE.CapsuleGeometry(0.42, 1.15, 8, 16), roundedMaterial(color));
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.88;
    const head = new window.THREE.Mesh(new window.THREE.SphereGeometry(0.34, 16, 16), roundedMaterial(color));
    head.position.set(0.92, 1.02, 0);
    const snout = new window.THREE.Mesh(new window.THREE.CapsuleGeometry(0.12, 0.28, 4, 8), roundedMaterial(0xe1c08f));
    snout.rotation.z = Math.PI / 2;
    snout.position.set(1.18, 0.92, 0);
    const earL = new window.THREE.Mesh(new window.THREE.ConeGeometry(0.11, 0.28, 10), roundedMaterial(0x9b7c4d));
    earL.position.set(0.78, 1.38, 0.16);
    earL.rotation.z = -0.18;
    const earR = earL.clone();
    earR.position.z = -0.16;

    const tail = new window.THREE.Mesh(new window.THREE.CapsuleGeometry(0.07, 0.52, 4, 8), roundedMaterial(0xb18653));
    tail.position.set(-0.95, 1.18, 0);
    tail.rotation.z = -0.75;

    const legs = [-0.42, -0.08, 0.24, 0.56].map((x) => {
      const leg = new window.THREE.Mesh(new window.THREE.CapsuleGeometry(0.09, 0.62, 4, 8), roundedMaterial(0xc49f68));
      leg.position.set(x, 0.36, x > 0.1 ? -0.16 : 0.16);
      return leg;
    });

    group.add(body, head, snout, earL, earR, tail, ...legs);
    group.userData = { tail, head, legs };
    return group;
  }

  function createCat() {
    const group = new window.THREE.Group();
    const body = new window.THREE.Mesh(new window.THREE.CapsuleGeometry(0.28, 0.75, 6, 12), roundedMaterial(0x656a74));
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.58;
    const head = new window.THREE.Mesh(new window.THREE.SphereGeometry(0.24, 14, 14), roundedMaterial(0x767c88));
    head.position.set(0.56, 0.78, 0);
    const earL = new window.THREE.Mesh(new window.THREE.ConeGeometry(0.08, 0.16, 10), roundedMaterial(0x767c88));
    earL.position.set(0.45, 1.02, 0.12);
    const earR = earL.clone();
    earR.position.z = -0.12;
    const tail = new window.THREE.Mesh(new window.THREE.CapsuleGeometry(0.05, 0.62, 4, 8), roundedMaterial(0x767c88));
    tail.position.set(-0.64, 0.94, 0);
    tail.rotation.z = -1.05;
    group.add(body, head, earL, earR, tail);
    group.userData = { tail, head };
    return group;
  }

  function createBins() {
    const group = new window.THREE.Group();
    const colors = [0x3f8e61, 0x3e79b9, 0xe07a3e];
    colors.forEach((color, index) => {
      const bin = new window.THREE.Mesh(
        new window.THREE.BoxGeometry(0.9, 1.7, 0.9),
        new window.THREE.MeshStandardMaterial({ color, roughness: 0.65 }),
      );
      bin.position.set(index * 1.1 - 1.1, 0.85, 0);
      group.add(bin);
    });
    group.position.set(4.3, 0, 1.2);
    return group;
  }

  const volunteer = createVolunteer();
  volunteer.position.set(-1.6, 0, 0.5);
  scene.add(volunteer);

  const dog = createDog();
  dog.position.set(1.15, -0.02, 0.6);
  scene.add(dog);

  const cat = createCat();
  cat.position.set(0.45, -0.02, -1.2);
  scene.add(cat);

  const bins = createBins();
  scene.add(bins);

  const donationCrystals = new window.THREE.Group();
  const crystalGeometry = new window.THREE.OctahedronGeometry(0.18, 0);
  for (let i = 0; i < 14; i += 1) {
    const crystal = new window.THREE.Mesh(
      crystalGeometry,
      new window.THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0xffd17b : 0x7fe8ff,
        emissive: i % 2 === 0 ? 0x8b5e18 : 0x135d76,
        transparent: true,
        opacity: 0.92,
        roughness: 0.22,
        metalness: 0.45,
      }),
    );
    crystal.userData = {
      radius: 1.8 + (i % 5) * 0.48,
      speed: 0.22 + (i % 4) * 0.05,
      offset: i * 0.7,
      lift: 1 + (i % 3) * 0.45,
    };
    donationCrystals.add(crystal);
  }
  scene.add(donationCrystals);

  const drone = new window.THREE.Group();
  const droneCore = new window.THREE.Mesh(
    new window.THREE.CylinderGeometry(0.22, 0.36, 0.36, 16),
    roundedMaterial(0xe7f0f3),
  );
  droneCore.rotation.x = Math.PI / 2;
  const droneRing = new window.THREE.Mesh(
    new window.THREE.TorusGeometry(0.58, 0.05, 10, 40),
    new window.THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.75 }),
  );
  droneRing.rotation.x = Math.PI / 2;
  const droneLight = new window.THREE.PointLight(0x7fd8ff, 4, 8, 2);
  drone.add(droneCore, droneRing, droneLight);
  drone.position.set(0, 4.2, -1.2);
  scene.add(drone);

  const portal = new window.THREE.Group();
  const portalOuter = new window.THREE.Mesh(
    new window.THREE.TorusGeometry(2.2, 0.12, 16, 120),
    new window.THREE.MeshBasicMaterial({ color: 0x8ce4ff, transparent: true, opacity: 0.58 }),
  );
  const portalInner = new window.THREE.Mesh(
    new window.THREE.TorusGeometry(1.56, 0.05, 12, 100),
    new window.THREE.MeshBasicMaterial({ color: 0xffd47a, transparent: true, opacity: 0.6 }),
  );
  const portalDisc = new window.THREE.Mesh(
    new window.THREE.CircleGeometry(1.45, 48),
    new window.THREE.MeshBasicMaterial({ color: 0x69c5ff, transparent: true, opacity: 0.08 }),
  );
  portal.add(portalOuter, portalInner, portalDisc);
  portal.position.set(0, 3.35, -4.8);
  scene.add(portal);

  const routeMap = new window.THREE.Group();
  const nodeGeometry = new window.THREE.IcosahedronGeometry(0.08, 0);
  const routeNodePositions = [
    [-4.2, 2.2, -2.8],
    [-1.2, 3.4, -3.8],
    [2.6, 2.8, -3.4],
    [4.6, 4.2, -2.2],
    [1.8, 4.9, -1.5],
  ];
  const routeNodes = routeNodePositions.map((position, index) => {
    const mesh = new window.THREE.Mesh(
      nodeGeometry,
      new window.THREE.MeshStandardMaterial({
        color: index % 2 === 0 ? 0x8af0ff : 0xffd27a,
        emissive: index % 2 === 0 ? 0x186a80 : 0x7d5213,
        emissiveIntensity: 0.5,
        roughness: 0.18,
        metalness: 0.5,
      }),
    );
    mesh.position.set(...position);
    routeMap.add(mesh);
    return mesh;
  });

  const routeLines = [];
  for (let index = 0; index < routeNodePositions.length - 1; index += 1) {
    const curve = new window.THREE.CatmullRomCurve3([
      new window.THREE.Vector3(...routeNodePositions[index]),
      new window.THREE.Vector3(
        (routeNodePositions[index][0] + routeNodePositions[index + 1][0]) / 2,
        Math.max(routeNodePositions[index][1], routeNodePositions[index + 1][1]) + 0.6,
        (routeNodePositions[index][2] + routeNodePositions[index + 1][2]) / 2,
      ),
      new window.THREE.Vector3(...routeNodePositions[index + 1]),
    ]);
    const line = new window.THREE.Mesh(
      new window.THREE.TubeGeometry(curve, 40, 0.025, 8, false),
      new window.THREE.MeshBasicMaterial({ color: 0x7ddfff, transparent: true, opacity: 0.45 }),
    );
    routeMap.add(line);
    routeLines.push(line);
  }
  scene.add(routeMap);

  const starCount = 420;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const radius = 18 + Math.random() * 10;
    const angle = Math.random() * Math.PI * 2;
    const height = 3 + Math.random() * 10;
    starPositions[i * 3] = Math.cos(angle) * radius;
    starPositions[i * 3 + 1] = height;
    starPositions[i * 3 + 2] = Math.sin(angle) * radius - 6;

    const color = new window.THREE.Color(i % 4 === 0 ? 0xffd47a : i % 3 === 0 ? 0x8ae9ff : 0xc8ffe0);
    starColors[i * 3] = color.r;
    starColors[i * 3 + 1] = color.g;
    starColors[i * 3 + 2] = color.b;
  }
  const starGeometry = new window.THREE.BufferGeometry();
  starGeometry.setAttribute("position", new window.THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute("color", new window.THREE.BufferAttribute(starColors, 3));
  const stars = new window.THREE.Points(
    starGeometry,
    new window.THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: window.THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  scene.add(stars);

  const auroraLayers = [];
  for (let i = 0; i < 3; i += 1) {
    const aurora = new window.THREE.Mesh(
      new window.THREE.PlaneGeometry(18, 7, 32, 1),
      new window.THREE.MeshBasicMaterial({
        color: i === 0 ? 0x74e3ff : i === 1 ? 0xa0ffce : 0xffd787,
        transparent: true,
        opacity: 0.07,
        side: window.THREE.DoubleSide,
        blending: window.THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    aurora.position.set(0, 8 + i * 0.9, -9 - i * 1.6);
    aurora.rotation.x = -0.65;
    auroraLayers.push(aurora);
    scene.add(aurora);
  }

  const bowl = new window.THREE.Mesh(
    new window.THREE.CylinderGeometry(0.35, 0.46, 0.14, 20),
    new window.THREE.MeshStandardMaterial({ color: 0xd9e4ea, roughness: 0.35, metalness: 0.45 }),
  );
  bowl.position.set(-0.35, 0.06, 1.4);
  scene.add(bowl);

  const highlightRing = new window.THREE.Mesh(
    new window.THREE.TorusGeometry(2.4, 0.08, 12, 60),
    new window.THREE.MeshBasicMaterial({ color: 0xffdb85, transparent: true, opacity: 0.55 }),
  );
  highlightRing.rotation.x = Math.PI / 2;
  highlightRing.position.y = 0.04;
  scene.add(highlightRing);

  function makeCurve(points) {
    return new window.THREE.CatmullRomCurve3(points.map(([x, y, z]) => new window.THREE.Vector3(x, y, z)), true);
  }

  const ribbonConfigs = {
    feeding: {
      color: 0xffc96f,
      curve: makeCurve([
        [-2.8, 0.48, 1.2],
        [-0.4, 1.55, 2.7],
        [2.8, 1.1, 0.8],
        [1.4, 0.65, -2.4],
        [-2.2, 0.9, -1.7],
      ]),
    },
    cleanup: {
      color: 0x7de4ff,
      curve: makeCurve([
        [4.2, 0.9, 1.8],
        [2.1, 1.9, 3.1],
        [-1.8, 1.15, 2.6],
        [-3.8, 0.75, -0.4],
        [-0.6, 1.4, -2.8],
      ]),
    },
    rescue: {
      color: 0xff8d75,
      curve: makeCurve([
        [0.2, 0.95, -2.6],
        [2.4, 2.4, -1.2],
        [2.2, 1.35, 1.9],
        [-1.5, 2.2, 2.6],
        [-2.8, 0.9, -0.2],
      ]),
    },
  };

  const ribbons = {};
  const ribbonTokens = {};
  Object.entries(ribbonConfigs).forEach(([key, config]) => {
    const ribbon = new window.THREE.Mesh(
      new window.THREE.TubeGeometry(config.curve, 160, 0.065, 10, true),
      new window.THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: key === "feeding" ? 0.88 : 0.2,
      }),
    );
    ribbons[key] = ribbon;
    scene.add(ribbon);

    ribbonTokens[key] = Array.from({ length: 6 }, (_, index) => {
      const token = new window.THREE.Mesh(
        new window.THREE.IcosahedronGeometry(0.09 + (index % 2) * 0.02, 0),
        new window.THREE.MeshStandardMaterial({
          color: config.color,
          emissive: config.color,
          emissiveIntensity: 0.35,
          roughness: 0.22,
          metalness: 0.65,
        }),
      );
      token.userData = { offset: index / 6 };
      scene.add(token);
      return token;
    });
  });

  const pointer = { x: 0, y: 0 };
  let activeMode = "feeding";
  let modeBlend = { feeding: 1, cleanup: 0, rescue: 0 };

  const modeTargets = {
    feeding: {
      camera: new window.THREE.Vector3(0, 5.4, 15),
      focusY: 1.2,
      laneColor: 0xffd27d,
      fillColor: 0x6ac4ff,
      haze: 0x10231f,
      droneLift: 4.2,
    },
    cleanup: {
      camera: new window.THREE.Vector3(1.1, 6.2, 13.3),
      focusY: 1.4,
      laneColor: 0x79dbff,
      fillColor: 0x8df9c7,
      haze: 0x10303a,
      droneLift: 5.4,
    },
    rescue: {
      camera: new window.THREE.Vector3(-0.8, 5.9, 12.2),
      focusY: 1.65,
      laneColor: 0xff8d75,
      fillColor: 0xffbb9d,
      haze: 0x291816,
      droneLift: 6.1,
    },
  };

  const modeButtons = document.querySelectorAll("[data-scene-mode]");
  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeMode = button.dataset.sceneMode;
      modeButtons.forEach((item) => item.classList.toggle("active", item === button));
      heroSceneTitle.textContent = sceneModes[activeMode].title;
      heroSceneText.textContent = sceneModes[activeMode].text;
    });
  });

  stage.addEventListener("pointermove", (event) => {
    const rect = stage.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  });

  function resize() {
    const width = stage.clientWidth || 1;
    const height = stage.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  window.addEventListener("resize", resize);
  resize();

  function animate(timeMs) {
    const t = timeMs * 0.001;
    requestAnimationFrame(animate);

    ["feeding", "cleanup", "rescue"].forEach((mode) => {
      modeBlend[mode] += ((activeMode === mode ? 1 : 0) - modeBlend[mode]) * 0.045;
    });

    const cleanupBlend = modeBlend.cleanup;
    const rescueBlend = modeBlend.rescue;
    const feedingBlend = modeBlend.feeding;
    const modeBoost = 1 + cleanupBlend * 0.28 + rescueBlend * 0.16;
    const routeRadius = 3.1 + cleanupBlend * 0.5 - rescueBlend * 0.9;

    volunteer.position.x = Math.cos(t * 0.45 * modeBoost) * routeRadius - 0.35;
    volunteer.position.z = Math.sin(t * 0.45 * modeBoost) * (routeRadius * (0.48 + cleanupBlend * 0.08));
    volunteer.rotation.y = -t * 0.45 * modeBoost + Math.PI * 0.5 + cleanupBlend * 0.18;
    volunteer.userData.legLeft.rotation.x = Math.sin(t * 3.2 * modeBoost) * 0.35;
    volunteer.userData.legRight.rotation.x = -Math.sin(t * 3.2 * modeBoost) * 0.35;
    volunteer.userData.armLeft.rotation.x = -Math.sin(t * 3.2 * modeBoost) * 0.28;
    volunteer.userData.armRight.rotation.x = Math.sin(t * 3.2 * modeBoost) * 0.28;

    dog.position.x = Math.cos(t * 0.6 * modeBoost + 0.6) * (2.1 - rescueBlend * 0.45) + 0.5;
    dog.position.z = Math.sin(t * 0.6 * modeBoost + 0.6) * (1.35 - rescueBlend * 0.25) + 0.2;
    dog.rotation.y = -t * 0.6 * modeBoost - 0.2 + rescueBlend * 0.35;
    dog.scale.y = 1 + Math.sin(t * 6.4) * 0.025;
    dog.userData.tail.rotation.z = -0.7 + Math.sin(t * (8 + cleanupBlend * 2) * modeBoost) * 0.35;
    dog.userData.head.rotation.y = Math.sin(t * 2.2) * 0.12;
    dog.userData.legs.forEach((leg, index) => {
      leg.rotation.x = Math.sin(t * 5.4 * modeBoost + index) * 0.18;
    });

    cat.position.x = Math.sin(t * 0.9 * modeBoost + 1.7) * (1.2 - rescueBlend * 0.25) - 0.2;
    cat.position.z = Math.cos(t * 0.7 * modeBoost + 0.9) * 0.95 - 1 + rescueBlend * 0.45;
    cat.position.y = Math.abs(Math.sin(t * 1.8 + rescueBlend)) * 0.06;
    cat.rotation.y = Math.sin(t * 0.9 * modeBoost) * (0.8 + rescueBlend * 0.3);
    cat.userData.tail.rotation.z = -0.95 + Math.sin(t * 4.8) * 0.22;
    cat.userData.head.rotation.y = Math.sin(t * 2.8) * 0.18;

    bins.position.y = cleanupBlend * 0.18;
    bins.position.z = 1.2 + cleanupBlend * Math.sin(t * 1.8) * 0.28;
    bins.rotation.y = cleanupBlend * Math.sin(t * 0.9) * 0.16;

    bowl.scale.setScalar(0.94 + feedingBlend * (0.08 + Math.sin(t * 3.4) * 0.04));
    bowl.position.y = 0.06 + feedingBlend * Math.sin(t * 2.6) * 0.05;

    donationCrystals.children.forEach((crystal) => {
      const data = crystal.userData;
      const angle = t * data.speed + data.offset + cleanupBlend * 0.4;
      crystal.position.set(
        Math.cos(angle) * data.radius,
        2.1 + Math.sin(angle * 1.6) * 0.7 + data.lift,
        Math.sin(angle) * data.radius,
      );
      crystal.rotation.x += 0.01;
      crystal.rotation.y += 0.014;
      crystal.scale.setScalar(0.85 + rescueBlend * 0.22 + Math.sin(angle * 2.4) * 0.06);
    });

    drone.position.x = Math.cos(t * (0.45 + rescueBlend * 0.45)) * (1.6 + cleanupBlend * 0.6);
    drone.position.z = Math.sin(t * (0.45 + rescueBlend * 0.45)) * 1.2 - 1.2;
    drone.position.y += ((modeTargets[activeMode].droneLift + Math.sin(t * 3.4) * 0.16) - drone.position.y) * 0.06;
    drone.rotation.y = t * 1.8;
    drone.rotation.z = Math.sin(t * 2.2) * 0.05;

    portal.position.y = 3.35 + Math.sin(t * 1.4) * 0.18;
    portal.rotation.y += 0.006 + cleanupBlend * 0.002;
    portal.rotation.z = Math.sin(t * 0.8) * 0.08;
    portalOuter.material.opacity = 0.45 + rescueBlend * 0.25 + Math.sin(t * 2.8) * 0.04;
    portalInner.material.opacity = 0.4 + feedingBlend * 0.22;
    portal.scale.setScalar(1 + cleanupBlend * 0.08 + Math.sin(t * 1.8) * 0.02);

    routeMap.rotation.y = Math.sin(t * 0.28) * 0.18 + cleanupBlend * 0.18;
    routeMap.position.y = 0.2 + Math.sin(t * 0.6) * 0.12;
    routeNodes.forEach((node, index) => {
      node.scale.setScalar(1 + Math.sin(t * 2.4 + index) * 0.14 + rescueBlend * 0.08);
      node.position.y = routeNodePositions[index][1] + Math.sin(t * 1.8 + index * 0.7) * 0.22;
    });
    routeLines.forEach((line, index) => {
      line.material.opacity = 0.22 + cleanupBlend * 0.34 + Math.sin(t * 2 + index) * 0.05;
    });

    stars.rotation.y += 0.0007 + rescueBlend * 0.0006;
    stars.rotation.x = Math.sin(t * 0.16) * 0.06;
    auroraLayers.forEach((aurora, index) => {
      aurora.position.x = Math.sin(t * (0.24 + index * 0.07)) * (1.4 + index * 0.6);
      aurora.material.opacity = 0.05 + cleanupBlend * 0.04 + Math.sin(t * 0.8 + index) * 0.02;
      aurora.rotation.z = Math.sin(t * 0.22 + index) * 0.08;
    });

    Object.entries(ribbons).forEach(([mode, ribbon]) => {
      ribbon.material.opacity += ((activeMode === mode ? 0.95 : 0.12) - ribbon.material.opacity) * 0.05;
      ribbon.material.color.set(ribbonConfigs[mode].color);
      ribbonTokens[mode].forEach((token, index) => {
        const progress = (t * (0.08 + index * 0.006) + token.userData.offset) % 1;
        const point = ribbonConfigs[mode].curve.getPointAt(progress);
        token.position.copy(point);
        token.visible = ribbon.material.opacity > 0.18;
        token.scale.setScalar((activeMode === mode ? 1.2 : 0.8) + Math.sin(t * 6 + index) * 0.05);
      });
    });

    highlightRing.scale.setScalar(0.98 + cleanupBlend * 0.09 - rescueBlend * 0.06 + Math.sin(t * 2.3) * 0.025);
    highlightRing.material.color.set(activeMode === "cleanup" ? 0x86d8ff : activeMode === "rescue" ? 0xff9d7c : 0xffdb85);
    scanRing.rotation.z += 0.002 + cleanupBlend * 0.0018;
    innerRing.rotation.z -= 0.003 + rescueBlend * 0.001;

    const dummy = new window.THREE.Object3D();
    towerData.forEach((tower, index) => {
      const driftY = Math.sin(t * 0.8 + tower.drift) * 0.2 + cleanupBlend * 0.15;
      dummy.position.set(
        Math.cos(tower.angle) * tower.radius,
        tower.height * 0.5 + driftY,
        Math.sin(tower.angle) * tower.radius,
      );
      dummy.scale.set(1, tower.height + rescueBlend * (index % 4 === 0 ? 0.6 : 0), 1);
      dummy.rotation.y = tower.angle + Math.sin(t * 0.2 + index) * 0.08;
      dummy.updateMatrix();
      skyline.setMatrixAt(index, dummy.matrix);
    });
    skyline.instanceMatrix.needsUpdate = true;

    const modeTarget = modeTargets[activeMode];
    fill.color.lerp(new window.THREE.Color(modeTarget.fillColor), 0.03);
    scene.fog.color.lerp(new window.THREE.Color(modeTarget.haze), 0.03);
    renderer.setClearColor(modeTarget.haze, 0);
    renderer.toneMappingExposure += ((1.08 + cleanupBlend * 0.08 + rescueBlend * 0.04) - renderer.toneMappingExposure) * 0.03;

    camera.position.x += ((modeTarget.camera.x + pointer.x * 1.6) - camera.position.x) * 0.04;
    camera.position.y += ((modeTarget.camera.y + pointer.y * -0.35) - camera.position.y) * 0.04;
    camera.position.z += ((modeTarget.camera.z + Math.cos(t * 0.4) * 0.12) - camera.position.z) * 0.04;
    camera.lookAt(0, modeTarget.focusY, 0);

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
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

function formatDate(value) {
  if (!value) return "Just now";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
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
           <p>The operations dashboard updates immediately for the NGO team.</p>`,
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
      state.reports.unshift({ ...payload, id: `local-${Date.now()}`, createdAt: new Date().toISOString(), status: "open" });
      fallbackSave();
    }
    reportForm.reset();
    renderAll();
  } catch (error) {
    alert(error.message);
  }
});

document.querySelector("#clearReports").addEventListener("click", async () => {
  const confirmed = window.confirm("Only admins can clear reports from the shared queue. Continue?");
  if (!confirmed) return;

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

loadData().then(() => {
  renderAll();
  initHeroScene();
  initRevealMotion();
});

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
