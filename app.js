const canvas = document.getElementById("canvas");
const canvasContent = document.getElementById("canvas-content");
const svg = document.getElementById("connections");
const linesLayer = document.getElementById("connection-lines");
const trashZone = document.getElementById("trash-zone");
const toolbar = document.getElementById("type-toolbar");
const cardSidebar = document.getElementById("card-sidebar");
const sidebarTitle = document.getElementById("sidebar-title");
const sidebarBody = document.getElementById("sidebar-body");
const sidebarClose = document.getElementById("sidebar-close");
const flowTitleInput = document.getElementById("flow-title-input");
const flowBackButton = document.getElementById("flow-back");
let zoomInButton = null;
let zoomOutButton = null;
let zoomDisplay = null;

const state = {
  cards: [],
  connections: [],
};

const cardElements = new Map();

const storage = createStorage();

const TRIGGERS = [
  {
    id: "post-comment",
    label: "Post or Reel Comments",
    description: "Someone comments on your Post/Reel",
    icon: "ti-brand-instagram",
  },
  {
    id: "story-reply",
    label: "Story Reply",
    description: "Someone replies to your Story",
    icon: "ti-history",
  },
  {
    id: "message",
    label: "Instagram Message",
    description: "Someone sends you a DM",
    icon: "ti-message",
  },
  {
    id: "share-story",
    label: "Instagram Message",
    description: "Someone shares your Post/Reel as a Story",
    icon: "ti-share-3",
  },
  {
    id: "ads-click",
    label: "Instagram Ads",
    description: "Someone clicks your Instagram Ad",
    icon: "ti-ad",
  },
  {
    id: "live-comment",
    label: "Live Comments",
    description: "Someone comments on your Live",
    icon: "ti-video-plus",
  },
  {
    id: "referral",
    label: "Instagram Ref URL",
    description: "Someone clicks your referral link",
    icon: "ti-link",
  },
];

const viewport = {
  x: 0,
  y: 0,
  scale: 1,
};

const GRID_BASE_SIZE = 32;

let activeCardId = null;
let viewportAnimation = null;
let inboundInitialized = false;

const VIEW_BOUNDS = {
  minScale: 0.25,
  maxScale: 1.5,
};
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5];

function applyViewport() {
  if (!canvasContent) return;
  canvasContent.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
  updateGridBackground();
  updateZoomDisplay();
}

const CARD_TYPES = {
  message: {
    label: "Message",
    border: "#eee", // neutral tint-6-ish
    pastel: "#dfdfe3ff", // neutral tint-5-ish
    accent: "#3f3f46",
    iconColor: "#3f3f46",
    icon: "ti-message-circle-2",
  },
  ai: {
    label: "AI Agent",
    border: "#f0eefb", // tint-purple-6
    pastel: "#dad2fe", // tint-purple-5
    accent: "#4b2f88", // tint-purple-1
    iconColor: "#4b2f88",
    icon: "ti-robot",
  },
  action: {
    label: "Action",
    border: "#feeecf", // tint-yellow-6
    pastel: "#f7d48f", // tint-yellow-5
    accent: "#594000", // tint-yellow-1
    iconColor: "#594000",
    icon: "ti-bolt",
  },
  condition: {
    label: "Condition",
    border: "#e1f4f7", // tint-lightBlue-6
    pastel: "#91e6f5", // tint-lightBlue-5
    accent: "#134b67", // tint-lightBlue-1
    iconColor: "#134b67",
    icon: "ti-filter",
  },
  start: {
    label: "When",
    border: "#e6f5e9", // tint-green-6
    pastel: "#96eeb1", // tint-green-5
    accent: "#005227", // tint-green-1
    iconColor: "#005227",
    icon: "ti-player-play",
    locked: true,
  },
  startFlow: {
    label: "Start Flow",
    border: "#ecf4df", // tint-lime-6
    pastel: "#c5e590", // tint-lime-5
    accent: "#384e00", // tint-lime-1
    iconColor: "#384e00",
    icon: "ti-route",
  },
  randomizer: {
    label: "Randomizer",
    border: "#f7ecf9", // tint-magenta-6
    pastel: "#f1c9f9", // tint-magenta-5
    accent: "#671f75", // tint-magenta-1
    iconColor: "#671f75",
    icon: "ti-arrows-split-2",
  },
  delay: {
    label: "Delay",
    border: "#f7eeec", // tint-red-6
    pastel: "#ffcbc0", // tint-red-5
    accent: "#7a2113", // tint-red-1
    iconColor: "#7a2113",
    icon: "ti-clock",
  },
};

const CARD_TYPE_KEYS = Object.keys(CARD_TYPES);
const FLOW_TITLE_KEY = "flow-title";
const DEFAULT_FLOW_TITLE = "Untitled flow";
let flowTitle = DEFAULT_FLOW_TITLE;

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `card-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function getTypeMeta(type) {
  const fallback = CARD_TYPES[CARD_TYPE_KEYS[0]];
  const meta = CARD_TYPES[type] || fallback;
  return {
    ...meta,
    accent: meta.accent || fallback.accent,
    pastel: meta.pastel || fallback.pastel,
    border: meta.border || fallback.border || meta.pastel || fallback.pastel,
    iconColor: meta.iconColor || meta.accent || fallback.accent,
    locked: Boolean(meta.locked),
  };
}

function ensureCardType(card) {
  if (!card.type || !CARD_TYPES[card.type]) {
    card.type = CARD_TYPE_KEYS[0];
  }
  if (!card.title || !card.title.trim()) {
    card.title = getTypeMeta(card.type).label;
  }
  normalizeStartTriggers(card);
}

function normalizeStartTriggers(card) {
  if (card.type !== "start") return;
  if (!Array.isArray(card.triggerIds)) {
    const fallback = card.triggerId ? [card.triggerId] : [];
    card.triggerIds = fallback;
  }
  const validIds = new Set(TRIGGERS.map((t) => t.id));
  card.triggerIds = Array.from(
    new Set((card.triggerIds || []).filter((id) => validIds.has(id)))
  );
}

function ensureStartCard() {
  const hasStart = state.cards.some((c) => c.type === "start");
  if (hasStart) return;
  const startPos = getDefaultSpawnPosition();
  const startCard = createCardData("Start", startPos.x, startPos.y, "start");
  state.cards.unshift(startCard);
  persist(storage.saveCard(startCard));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

init();

function init() {
  loadInitialState();
  window.addEventListener("resize", redrawConnections);
  initToolbar();
  initSidebarInteractions();
  initFlowHeader();
  initZoomControls();
  applyViewport();
  initPanAndZoom();
}

async function loadInitialState() {
  try {
    const { cards, connections } = await storage.loadState();

    if (!cards.length) {
      const startPos = getDefaultSpawnPosition();
      const starterCards = [
        createCardData("Start", startPos.x, startPos.y, "start"),
        createCardData(null, 120, 120, "condition"),
        createCardData(null, 420, 260, "action"),
      ];
      await storage.saveMany("cards", starterCards);
      state.cards = starterCards;
    } else {
      state.cards = cards;
    }

    state.connections = connections;
  } catch (error) {
    console.warn("Falling back to in-memory state:", error);
    state.cards = [
      createCardData("Start", 40, 40, "start"),
      createCardData(null, 120, 120, "condition"),
      createCardData(null, 420, 260, "action"),
    ];
    state.connections = [];
  }

  state.cards.forEach(ensureCardType);
  ensureStartCard();

  renderCards();
  redrawConnections();
}

function createCardData(title, x, y, type = CARD_TYPE_KEYS[0]) {
  const meta = getTypeMeta(type);
  return {
    id: createId(),
    title:
      type === "start"
        ? "When someone..."
        : title && title.trim()
        ? title.trim()
        : meta.label,
    x,
    y,
    type,
    triggerId: null,
    triggerIds: type === "start" ? [] : null,
  };
}

function renderCards() {
  cardElements.forEach((el) => el.remove());
  cardElements.clear();

  state.cards.forEach((card) => {
    const cardEl = document.createElement("div");
    cardEl.className = "card";
    cardEl.dataset.cardId = card.id;
    cardEl.dataset.cardType = card.type;
    const typeMeta = getTypeMeta(card.type);
    cardEl.style.setProperty("--card-accent", typeMeta.accent);
    cardEl.style.setProperty("--card-pastel", typeMeta.pastel);
    cardEl.style.setProperty("--card-border", typeMeta.border);
    cardEl.style.setProperty("--card-icon", typeMeta.iconColor);
    cardEl.style.setProperty("--card-icon-bg", typeMeta.border);

    const connectorOut = document.createElement("div");
    connectorOut.className = "connector connector-out";

    const headerEl = document.createElement("div");
    headerEl.className = "card-header";
    headerEl.appendChild(createTypeIcon(typeMeta, { asConnector: true }));
    const titleText = document.createElement("p");
    titleText.className = "card-title-text";
    titleText.textContent = card.title;
    headerEl.appendChild(titleText);

    const footerEl = document.createElement("div");
    footerEl.className = "card-footer";
    const nextLabel = document.createElement("span");
    nextLabel.className = "card-next-label";
    nextLabel.textContent = "NEXT";
    footerEl.appendChild(nextLabel);

    cardEl.appendChild(headerEl);
    if (card.type === "start") {
      renderStartContext(card, cardEl);
    }
    cardEl.appendChild(footerEl);
    cardEl.appendChild(connectorOut);
    canvasContent.appendChild(cardEl);
    cardElements.set(card.id, cardEl);

    positionCard(card, cardEl);
    enableCardDrag(card, cardEl);
    enableConnectorDrag(card, connectorOut);
  });
  highlightSelectedCard();
  updateInboundStyles();
  refreshSidebar();
}

function createTypeIcon(typeMeta, options = {}) {
  const iconWrap = document.createElement("div");
  iconWrap.className = "type-icon";
  if (options.asConnector) {
    iconWrap.classList.add("connector", "connector-in");
  }
  iconWrap.style.color = typeMeta.iconColor || typeMeta.accent;
  const iconEl = document.createElement("i");
  iconEl.className = `ti ${typeMeta.icon}`;
  iconEl.setAttribute("aria-hidden", "true");
  iconWrap.appendChild(iconEl);
  return iconWrap;
}

function initToolbar() {
  if (!toolbar) return;
  toolbar.innerHTML = "";
  CARD_TYPE_KEYS.forEach((typeKey) => {
    if (typeKey === "start") return;
    const meta = getTypeMeta(typeKey);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toolbar-button";
    button.dataset.cardType = typeKey;
    button.dataset.tooltip = meta.label;
    button.style.setProperty("--preview-border", meta.border);
    button.style.setProperty("--preview-bg", meta.pastel);
    button.style.color = meta.iconColor;
    button.title = meta.label;
    button.style.backgroundColor = meta.pastel;
    button.style.borderColor = meta.border;

    const icon = document.createElement("i");
    icon.className = `ti ${meta.icon}`;
    icon.setAttribute("aria-hidden", "true");
    button.appendChild(icon);

    if (typeKey === "action") {
      const divider = document.createElement("div");
      divider.className = "divider";
      toolbar.appendChild(divider);
    }

    button.addEventListener("pointerdown", (event) =>
      startToolbarDrag(event, typeKey, button)
    );

    toolbar.appendChild(button);
  });

  const divider = document.createElement("div");
  divider.className = "divider vertical";
  toolbar.appendChild(divider);

  const buildIconButton = (id, iconName, tooltip) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = id;
    btn.className = "flow-history-button";
    btn.dataset.tooltip = tooltip;
    btn.setAttribute("aria-label", tooltip);
    const icon = document.createElement("i");
    icon.className = `ti ${iconName}`;
    icon.setAttribute("aria-hidden", "true");
    btn.appendChild(icon);
    return btn;
  };

  zoomInButton = buildIconButton("zoom-in", "ti-plus", "Zoom in");
  zoomDisplay = document.createElement("span");
  zoomDisplay.id = "zoom-display";
  zoomDisplay.textContent = "100%";
  zoomDisplay.setAttribute("aria-live", "polite");
  zoomDisplay.className = "zoom-display";
  zoomOutButton = buildIconButton("zoom-out", "ti-minus", "Zoom out");
  const zoomDivider = document.createElement("div");
  zoomDivider.className = "divider vertical";
  const zoomHelp = buildIconButton("zoom-help", "ti-question-mark", "Help");

  toolbar.appendChild(zoomOutButton);
  toolbar.appendChild(zoomDisplay);
  toolbar.appendChild(zoomInButton);
  toolbar.appendChild(zoomDivider);
  toolbar.appendChild(zoomHelp);
}

function spawnCardOfType(type, position) {
  const spawnPos = position
    ? { x: position.x - 110, y: position.y - 70 }
    : getDefaultSpawnPosition();
  const card = createCardData(null, spawnPos.x, spawnPos.y, type);
  state.cards.push(card);
  persist(storage.saveCard(card));
  renderCards();
  redrawConnections();
  selectCard(card);
}

function getDefaultSpawnPosition() {
  const bounds = getVisibleWorldBounds();
  return {
    x: bounds.left + bounds.width / 2 - 110,
    y: bounds.top + bounds.height / 2 - 70,
  };
}
function initSidebarInteractions() {
  if (sidebarClose) {
    sidebarClose.addEventListener("click", () => hideSidebar());
  }
}

function initFlowHeader() {
  if (flowBackButton) {
    flowBackButton.addEventListener("click", () => {
      if (window.history.length > 1) {
        window.history.back();
      }
    });
  }

  if (!flowTitleInput) return;
  flowTitle = loadFlowTitle();
  flowTitleInput.value = flowTitle;

  const commitTitle = () => {
    const trimmed = (flowTitleInput.value || "").trim();
    flowTitle = trimmed || DEFAULT_FLOW_TITLE;
    flowTitleInput.value = flowTitle;
    saveFlowTitle(flowTitle);
  };

  flowTitleInput.addEventListener("input", () => {
    flowTitle = flowTitleInput.value;
  });

  flowTitleInput.addEventListener("blur", commitTitle);

  flowTitleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitTitle();
      flowTitleInput.blur();
    }
  });
}

function initZoomControls() {
  if (zoomInButton) {
    zoomInButton.addEventListener("click", () => setZoomToNext("in"));
  }
  if (zoomOutButton) {
    zoomOutButton.addEventListener("click", () => setZoomToNext("out"));
  }
  updateZoomDisplay();
}

function startToolbarDrag(event, type, button) {
  if (event.button !== 0) return;
  event.preventDefault();
  const pointerId = event.pointerId;
  button.setPointerCapture(pointerId);
  button.dataset.dragging = "true";
  let moved = false;
  const preview = createToolbarPreview(type);

  const updatePreview = (clientX, clientY) => {
    preview.style.transform = `translate(${clientX - 22}px, ${clientY - 22}px)`;
  };

  updatePreview(event.clientX, event.clientY);

  const onMove = (e) => {
    if (e.pointerId !== pointerId) return;
    moved = true;
    updatePreview(e.clientX, e.clientY);
  };

  const onEnd = (e) => {
    if (e.pointerId !== pointerId) return;
    button.releasePointerCapture(pointerId);
    delete button.dataset.dragging;
    preview.remove();
    button.removeEventListener("pointermove", onMove);
    button.removeEventListener("pointerup", onEnd);
    button.removeEventListener("pointercancel", onEnd);

    if (!moved) {
      spawnCardOfType(type);
      return;
    }

    if (isPointInsideCanvas(e.clientX, e.clientY)) {
      const world = screenToWorld(e.clientX, e.clientY);
      spawnCardOfType(type, world);
    }
  };

  button.addEventListener("pointermove", onMove);
  button.addEventListener("pointerup", onEnd);
  button.addEventListener("pointercancel", onEnd);
}

function createToolbarPreview(type) {
  const meta = getTypeMeta(type);
  const preview = document.createElement("div");
  preview.className = "toolbar-drag-preview";
  preview.style.setProperty("--preview-border", meta.border);
  preview.style.setProperty("--preview-bg", meta.pastel);
  preview.style.setProperty("--preview-accent", meta.iconColor);

  const icon = document.createElement("i");
  icon.className = `ti ${meta.icon}`;
  preview.appendChild(icon);
  document.body.appendChild(preview);
  return preview;
}

function refreshSidebar() {
  if (!activeCardId) return;
  const card = state.cards.find((c) => c.id === activeCardId);
  if (card) {
    updateSidebarContent(card);
  } else {
    hideSidebar();
  }
}

function updateCardTitleText(cardId, title) {
  const cardEl = cardElements.get(cardId);
  if (!cardEl) return;
  const textEl = cardEl.querySelector(".card-title-text");
  if (textEl) {
    textEl.textContent = title;
  }
  if (activeCardId === cardId && sidebarTitle) {
    sidebarTitle.textContent = title;
  }
}

function getCardById(id) {
  if (!id) return null;
  return state.cards.find((card) => card.id === id) || null;
}

function updateInboundStyles() {
  const inboundCounts = new Map();
  state.connections.forEach((c) => {
    inboundCounts.set(c.toId, (inboundCounts.get(c.toId) || 0) + 1);
  });

  const allowAnimate = inboundInitialized;
  state.cards.forEach((card) => {
    const el = cardElements.get(card.id);
    if (!el) return;
    const meta = getTypeMeta(card.type);
    const hadInbound = el.classList.contains("has-inbound");
    const hasInbound =
      card.type === "start" || (inboundCounts.get(card.id) || 0) > 0;
    const bg = hasInbound ? meta.pastel : meta.border;
    el.classList.toggle("has-inbound", hasInbound);
    el.style.setProperty("--card-icon-bg", bg);

    if (allowAnimate && !hadInbound && hasInbound && card.type !== "start") {
      el.classList.add("inbound-pulse");
      setTimeout(() => el.classList.remove("inbound-pulse"), 800);
    } else if (!hasInbound) {
      el.classList.remove("inbound-pulse");
    }
  });
  inboundInitialized = true;
}

function getStartCard() {
  return state.cards.find((c) => c.type === "start") || null;
}

function renderStartContext(card, cardEl) {
  const contextEl =
    cardEl.querySelector(".card-context-list") ||
    (() => {
      const list = document.createElement("div");
      list.className = "card-context-list";
      cardEl.appendChild(list);
      return list;
    })();

  contextEl.innerHTML = "";
  normalizeStartTriggers(card);

  if (!card.triggerIds || card.triggerIds.length === 0) {
    const empty = document.createElement("p");
    empty.className = "card-context-text card-context-empty";
    empty.textContent = "Select what starts this flow";
    contextEl.appendChild(empty);
    return;
  }

  card.triggerIds.forEach((id) => {
    const trigger = TRIGGERS.find((t) => t.id === id);
    if (!trigger) return;

    const item = document.createElement("div");
    item.className = "card-context-text card-context-item";

    const icon = document.createElement("i");
    icon.className = `ti ${trigger.icon}`;
    icon.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = trigger.description;

    item.appendChild(icon);
    item.appendChild(text);
    contextEl.appendChild(item);
  });

  // Layout changes (e.g., added rows) can shift connector positions; redraw.
  requestAnimationFrame(redrawConnections);
}

function updateStartContext(card) {
  const el = cardElements.get(card.id);
  if (!el) return;
  renderStartContext(card, el);
}

function toggleStartTrigger(card, triggerId) {
  normalizeStartTriggers(card);
  if (!Array.isArray(card.triggerIds)) {
    card.triggerIds = [];
  }
  if (card.triggerIds.includes(triggerId)) {
    card.triggerIds = card.triggerIds.filter((id) => id !== triggerId);
  } else {
    card.triggerIds = [...card.triggerIds, triggerId];
  }
  updateStartContext(card);
  persist(storage.saveCard(card));
}

function selectCard(card) {
  if (!card) return;
  activeCardId = card.id;
  focusCard(card);
  updateSidebarContent(card);
  highlightSelectedCard();
}

function hideSidebar() {
  activeCardId = null;
  highlightSelectedCard();
  if (!cardSidebar) return;
  cardSidebar.classList.remove("visible");
  if (sidebarTitle) sidebarTitle.textContent = "";
  if (sidebarBody) sidebarBody.textContent = "";
}

function updateSidebarContent(card) {
  if (!cardSidebar) return;
  cardSidebar.classList.add("visible");
  const meta = getTypeMeta(card.type);
  if (sidebarTitle) sidebarTitle.textContent = card.title || meta.label;
  if (sidebarBody) {
    sidebarBody.innerHTML = "";

    const typeInfo = document.createElement("p");
    typeInfo.textContent = `Type: ${meta.label}`;
    typeInfo.style.marginTop = "0";

    sidebarBody.appendChild(typeInfo);

    if (card.type === "start") {
      const list = document.createElement("div");
      list.className = "trigger-list";
      TRIGGERS.forEach((trigger) => {
        const item = document.createElement("div");
        item.className = "trigger-item";
        const isSelected =
          Array.isArray(card.triggerIds) &&
          card.triggerIds.includes(trigger.id);
        if (isSelected) item.classList.add("selected");

        const iconWrap = document.createElement("div");
        iconWrap.className = "trigger-icon";
        const icon = document.createElement("i");
        icon.className = `ti ${trigger.icon}`;
        iconWrap.appendChild(icon);

        const desc = document.createElement("p");
        desc.className = "trigger-desc";
        desc.dataset.triggerId = trigger.id;
        desc.textContent = trigger.description;

        item.appendChild(iconWrap);
        item.appendChild(desc);
        item.addEventListener("click", () => {
          toggleStartTrigger(card, trigger.id);
          Array.from(list.children).forEach((child) => {
            const triggerId =
              child.querySelector(".trigger-desc")?.dataset.triggerId;
            const selected =
              triggerId &&
              card.triggerIds &&
              card.triggerIds.includes(triggerId);
            child.classList.toggle("selected", Boolean(selected));
          });
        });
        list.appendChild(item);
      });
      sidebarBody.appendChild(list);
    } else {
      const inputLabel = document.createElement("label");
      inputLabel.textContent = "Name";
      inputLabel.style.display = "block";
      inputLabel.style.fontSize = "0.75rem";
      inputLabel.style.textTransform = "uppercase";
      inputLabel.style.color = "#777";
      inputLabel.style.margin = "1rem 0 0.3rem";

      const input = document.createElement("input");
      input.type = "text";
      input.value = card.title;
      input.maxLength = 80;
      input.style.width = "100%";
      input.style.fontSize = "1rem";
      input.style.padding = "0.4rem 0.6rem";
      input.style.borderRadius = "10px";
      input.style.border = "1px solid #d4d4d8";
      input.addEventListener("input", () => {
        card.title = input.value;
        updateCardTitleText(card.id, card.title);
      });
      input.addEventListener("blur", () => {
        const trimmed = input.value.trim();
        card.title = trimmed || meta.label;
        input.value = card.title;
        updateCardTitleText(card.id, card.title);
        persist(storage.saveCard(card));
      });

      sidebarBody.appendChild(inputLabel);
      sidebarBody.appendChild(input);
      requestAnimationFrame(() => input.focus({ preventScroll: true }));
    }
  }
}

function highlightSelectedCard() {
  cardElements.forEach((el, id) => {
    el.classList.toggle("selected", id === activeCardId);
  });
}

function focusCard(card) {
  const bounds = getVisibleWorldBounds();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const targetX = card.x + 110;
  const targetY = card.y + 70;
  const nextViewportX = viewport.x + (centerX - targetX) * viewport.scale;
  const nextViewportY = viewport.y + (centerY - targetY) * viewport.scale;
  animateViewportTo(nextViewportX, nextViewportY);
}

function positionCard(card, el) {
  if (typeof card.x !== "number") card.x = 24;
  if (typeof card.y !== "number") card.y = 24;
  el.style.left = `${card.x}px`;
  el.style.top = `${card.y}px`;
}

function enableCardDrag(card, cardEl) {
  let pointerId = null;
  let origin = null;
  let overTrashZone = false;
  let movedDuringDrag = false;
  let trashVisible = false;
  const allowTrash = card.type !== "start";
  const DRAG_THRESHOLD = 4;

  cardEl.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".connector")) {
      return;
    }

    pointerId = event.pointerId;
    origin = {
      pointerWorld: screenToWorld(event.clientX, event.clientY),
      cardX: card.x,
      cardY: card.y,
    };

    cardEl.setPointerCapture(pointerId);
    cardEl.classList.add("dragging");
    movedDuringDrag = false;
    overTrashZone = false;
    trashVisible = false;
  });

  cardEl.addEventListener("pointermove", (event) => {
    if (pointerId === null || event.pointerId !== pointerId) return;

    const currentWorld = screenToWorld(event.clientX, event.clientY);
    const dx = currentWorld.x - origin.pointerWorld.x;
    const dy = currentWorld.y - origin.pointerWorld.y;
    if (
      !movedDuringDrag &&
      (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)
    ) {
      movedDuringDrag = true;
      if (allowTrash) {
        showTrashZone();
        trashVisible = true;
      }
    }
    card.x = origin.cardX + dx;
    card.y = origin.cardY + dy;

    cardEl.style.left = `${card.x}px`;
    cardEl.style.top = `${card.y}px`;
    redrawConnections();

    overTrashZone = allowTrash
      ? isPointerInTrash(event.clientX, event.clientY)
      : false;
    updateTrashZoneState(cardEl, overTrashZone);
  });

  ["pointerup", "pointercancel"].forEach((evt) => {
    cardEl.addEventListener(evt, (event) => {
      if (pointerId === null || event.pointerId !== pointerId) return;
      cardEl.releasePointerCapture(pointerId);
      pointerId = null;
      cardEl.classList.remove("dragging");
      const droppedOnTrash =
        allowTrash && isPointerInTrash(event.clientX, event.clientY);
      if (droppedOnTrash) {
        if (trashVisible) hideTrashZone();
        updateTrashZoneState(cardEl, false);
        removeCard(card.id);
        return;
      }
      if (trashVisible) hideTrashZone();
      updateTrashZoneState(cardEl, false);
      persist(storage.saveCard(card));
      if (!movedDuringDrag) {
        selectCard(card);
      } else if (activeCardId === card.id) {
        updateSidebarContent(card);
      }
      movedDuringDrag = false;
      trashVisible = false;
    });
  });
}

function enableConnectorDrag(card, connector) {
  connector.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    const pointerId = event.pointerId;
    const start = getConnectorCenter(card.id, "out");
    const tempPath = createPath();
    tempPath.classList.add("pending");
    linesLayer.appendChild(tempPath);

    connector.setPointerCapture(pointerId);

    const onMove = (e) => {
      if (e.pointerId !== pointerId) return;
      const point = getRelativePoint(e);
      drawPath(tempPath, start, point);
    };

    const onUp = (e) => {
      if (e.pointerId !== pointerId) return;
      connector.releasePointerCapture(pointerId);
      connector.removeEventListener("pointermove", onMove);
      connector.removeEventListener("pointerup", onUp);
      connector.removeEventListener("pointercancel", onUp);
      tempPath.remove();

      const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
      const targetCardEl = dropTarget && dropTarget.closest(".card");
      const targetId = targetCardEl && targetCardEl.dataset.cardId;
      const targetCard = getCardById(targetId);

      if (targetId && targetId !== card.id && targetCard?.type !== "start") {
        createConnection(card.id, targetId);
      }
    };

    connector.addEventListener("pointermove", onMove);
    connector.addEventListener("pointerup", onUp);
    connector.addEventListener("pointercancel", onUp);
  });
}

function initPanAndZoom() {
  let panPointerId = null;
  let panOrigin = null;

  canvas.addEventListener("pointerdown", (event) => {
    if (
      event.target.closest(".card") ||
      event.target.closest(".connector") ||
      (trashZone && trashZone.contains(event.target))
    ) {
      return;
    }
    hideSidebar();
    cancelViewportAnimation();
    panPointerId = event.pointerId;
    panOrigin = {
      x: event.clientX,
      y: event.clientY,
      startX: viewport.x,
      startY: viewport.y,
    };
    canvas.setPointerCapture(panPointerId);
    canvas.classList.add("panning");
  });

  canvas.addEventListener("pointermove", (event) => {
    if (panPointerId === null || event.pointerId !== panPointerId) return;
    const dx = event.clientX - panOrigin.x;
    const dy = event.clientY - panOrigin.y;
    viewport.x = panOrigin.startX + dx;
    viewport.y = panOrigin.startY + dy;
    applyViewport();
  });

  const finishPan = (event) => {
    if (panPointerId === null || event.pointerId !== panPointerId) return;
    canvas.releasePointerCapture(panPointerId);
    panPointerId = null;
    panOrigin = null;
    canvas.classList.remove("panning");
  };

  canvas.addEventListener("pointerup", finishPan);
  canvas.addEventListener("pointercancel", finishPan);

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      cancelViewportAnimation();
      const rect = canvas.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      const delta = -event.deltaY;
      const zoomFactor = Math.exp(delta * 0.001);
      const targetScale = clamp(
        viewport.scale * zoomFactor,
        VIEW_BOUNDS.minScale,
        VIEW_BOUNDS.maxScale
      );
      zoomToScale(targetScale, { offsetX, offsetY });
    },
    { passive: false }
  );
}

function animateViewportTo(targetX, targetY, duration = 350) {
  cancelViewportAnimation();
  const startX = viewport.x;
  const startY = viewport.y;
  const deltaX = targetX - startX;
  const deltaY = targetY - startY;
  const startTime = performance.now();

  const step = (now) => {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = easeOutCubic(t);
    viewport.x = startX + deltaX * eased;
    viewport.y = startY + deltaY * eased;
    applyViewport();
    if (t < 1) {
      viewportAnimation.rafId = requestAnimationFrame(step);
    } else {
      viewportAnimation = null;
    }
  };

  viewportAnimation = { rafId: requestAnimationFrame(step) };
}

function cancelViewportAnimation() {
  if (viewportAnimation?.rafId) {
    cancelAnimationFrame(viewportAnimation.rafId);
    viewportAnimation = null;
  }
}

function showTrashZone() {
  if (!trashZone) return;
  trashZone.classList.add("visible");
}

function hideTrashZone() {
  if (!trashZone) return;
  trashZone.classList.remove("visible");
  trashZone.classList.remove("active");
}

function updateTrashZoneState(cardEl, isOver) {
  if (!trashZone) return;
  trashZone.classList.toggle("active", isOver);
  if (cardEl) {
    cardEl.classList.toggle("over-trash", isOver);
  }
}

function isPointerInTrash(x, y) {
  if (!trashZone || !trashZone.classList.contains("visible")) return false;
  const rect = trashZone.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function removeOutgoingConnections(fromId) {
  const outgoing = state.connections
    .filter((c) => c.fromId === fromId)
    .map((c) => c.id);
  outgoing.forEach((id) => removeConnection(id));
}

function createConnection(fromId, toId) {
  const duplicate = state.connections.some(
    (c) => c.fromId === fromId && c.toId === toId
  );
  if (duplicate) return;

  // Only allow a single outbound connection; replace existing if present.
  removeOutgoingConnections(fromId);

  const connection = {
    id: createId(),
    fromId,
    toId,
  };
  state.connections.push(connection);
  persist(storage.saveConnection(connection));
  redrawConnections();
  updateInboundStyles();
  pulseInbound(toId);
}

function removeCard(cardId) {
  const existing = getCardById(cardId);
  if (existing && existing.type === "start") return;
  const index = state.cards.findIndex((card) => card.id === cardId);
  if (index === -1) return;
  state.cards.splice(index, 1);
  const existingEl = cardElements.get(cardId);
  if (existingEl) {
    existingEl.remove();
  }
  cardElements.delete(cardId);
  if (activeCardId === cardId) {
    hideSidebar();
  }

  const removedConnections = state.connections.filter(
    (conn) => conn.fromId === cardId || conn.toId === cardId
  );
  if (removedConnections.length) {
    const ids = new Set(removedConnections.map((conn) => conn.id));
    state.connections = state.connections.filter((conn) => !ids.has(conn.id));
    removedConnections.forEach((conn) => {
      persist(storage.deleteConnection(conn.id));
    });
  }

  persist(storage.deleteCard(cardId));
  renderCards();
  redrawConnections();
  updateInboundStyles();
}

function redrawConnections() {
  while (linesLayer.firstChild) {
    linesLayer.firstChild.remove();
  }

  state.connections.forEach((connection) => {
    const fromPoint = getConnectorCenter(connection.fromId, "out");
    const toPoint = getConnectorCenter(connection.toId, "in");
    if (!fromPoint || !toPoint) return;

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("connection");
    group.dataset.connectionId = connection.id;

    const path = createPath();
    path.classList.add("connection-path");
    drawPath(path, fromPoint, toPoint);

    const deleteHandle = createDeleteHandle(connection.id);
    positionDeleteHandle(deleteHandle, fromPoint, toPoint);

    group.appendChild(path);
    group.appendChild(deleteHandle);
    linesLayer.appendChild(group);
  });

  updateInboundStyles();
}

function createPath() {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("stroke", "#777");
  path.setAttribute("stroke-width", "1");
  path.setAttribute("fill", "none");
  path.setAttribute("marker-end", "url(#arrowhead)");
  return path;
}

function drawPath(path, start, end) {
  if (!start || !end) return;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.hypot(dx, dy) || 1;
  const handle = clamp(Math.abs(dx) * 0.45 + 30, 40, 140);

  // Reduce sag when nodes are close; keep it subtle.
  const sag = clamp(dy * 0.25, -handle * 0.4, handle * 0.4);

  const c1x = start.x + handle;
  const c1y = start.y + sag * 0.4;

  const c2x = end.x - handle;
  const c2y = end.y - sag * 0.4;

  const d = `M ${start.x} ${start.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${end.x} ${end.y}`;
  path.setAttribute("d", d);
}

function createDeleteHandle(connectionId) {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.classList.add("delete-handle");

  const circle = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle"
  );
  circle.setAttribute("r", "10");

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "path");
  icon.setAttribute("d", "M -4 -4 L 4 4 M -4 4 L 4 -4");

  group.appendChild(circle);
  group.appendChild(icon);

  group.addEventListener("pointerdown", (event) => event.stopPropagation());
  group.addEventListener("click", (event) => {
    event.stopPropagation();
    removeConnection(connectionId);
  });

  return group;
}

function positionDeleteHandle(handle, start, end) {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  handle.setAttribute("transform", `translate(${midX} ${midY})`);
}

function removeConnection(connectionId) {
  const index = state.connections.findIndex((conn) => conn.id === connectionId);
  if (index === -1) return;
  state.connections.splice(index, 1);
  persist(storage.deleteConnection(connectionId));
  redrawConnections();
  updateInboundStyles();
}

function getConnectorCenter(cardId, type = "out") {
  const cardEl = cardElements.get(cardId);
  if (!cardEl) return null;
  const canvasRect = canvas.getBoundingClientRect();

  if (type === "in") {
    const inEl =
      cardEl.querySelector(".connector-in") ||
      cardEl.querySelector(".type-icon");
    if (inEl) {
      const r = inEl.getBoundingClientRect();
      const cy = r.top + r.height / 2;
      // Keep the x anchored to the card's left edge
      return screenToWorld(cardEl.getBoundingClientRect().left, cy);
    }
    const rect = cardEl.getBoundingClientRect();
    return screenToWorld(rect.left, rect.top + rect.height / 2);
  }

  const connector =
    cardEl.querySelector(".connector-out") ||
    cardEl.querySelector(".connector");
  if (!connector) return null;
  const connectorRect = connector.getBoundingClientRect();
  const point = screenToWorld(
    connectorRect.left + connectorRect.width / 2,
    connectorRect.top + connectorRect.height / 2
  );
  return point;
}

function getRelativePoint(event) {
  return screenToWorld(event.clientX, event.clientY);
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return {
    x: (x - viewport.x) / viewport.scale,
    y: (y - viewport.y) / viewport.scale,
  };
}

function getVisibleWorldBounds() {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width / viewport.scale;
  const height = rect.height / viewport.scale;
  const left = -viewport.x / viewport.scale;
  const top = -viewport.y / viewport.scale;
  return { left, top, width, height };
}

function isPointInsideCanvas(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

function updateGridBackground() {
  if (!canvas) return;
  const size = Math.max(8, GRID_BASE_SIZE * viewport.scale);
  const offsetX = ((viewport.x % size) + size) % size;
  const offsetY = ((viewport.y % size) + size) % size;
  canvas.style.setProperty("--grid-size", `${size}px`);
  canvas.style.setProperty("--grid-offset-x", `${offsetX}px`);
  canvas.style.setProperty("--grid-offset-y", `${offsetY}px`);
}

function updateZoomDisplay() {
  if (!zoomDisplay) return;
  const percent = Math.round(viewport.scale * 100);
  zoomDisplay.textContent = `${percent}`;
}

function zoomToScale(targetScale, options = {}) {
  if (!canvas) return;
  const nextScale = clamp(
    targetScale,
    VIEW_BOUNDS.minScale,
    VIEW_BOUNDS.maxScale
  );
  const rect = canvas.getBoundingClientRect();
  const offsetX =
    typeof options.offsetX === "number" ? options.offsetX : rect.width / 2;
  const offsetY =
    typeof options.offsetY === "number" ? options.offsetY : rect.height / 2;
  const scaleRatio = nextScale / viewport.scale;
  viewport.x = offsetX - (offsetX - viewport.x) * scaleRatio;
  viewport.y = offsetY - (offsetY - viewport.y) * scaleRatio;
  viewport.scale = nextScale;
  applyViewport();
}

function setZoomToNext(direction) {
  const levels = [...ZOOM_LEVELS].sort((a, b) => a - b);
  const current = viewport.scale;
  const tolerance = 0.0001;
  let next = current;
  if (direction === "in") {
    next = levels.find((level) => level - current > tolerance) ?? levels.at(-1);
  } else if (direction === "out") {
    const below = levels.filter((level) => current - level > tolerance);
    next = below.length ? below[below.length - 1] : levels[0];
  }
  zoomToScale(next);
}

function loadFlowTitle() {
  try {
    const stored = window.localStorage.getItem(FLOW_TITLE_KEY);
    if (stored && stored.trim()) {
      return stored;
    }
  } catch (error) {
    console.warn("Unable to read flow title from storage.", error);
  }
  return DEFAULT_FLOW_TITLE;
}

function saveFlowTitle(title) {
  try {
    window.localStorage.setItem(FLOW_TITLE_KEY, title);
  } catch (error) {
    console.warn("Unable to save flow title to storage.", error);
  }
}

function createStorage() {
  const DB_NAME = "canvas-links";
  const DB_VERSION = 1;
  let dbPromise = null;
  let useFallback = false;
  const fallback = createLocalStorageAdapter();

  function getDB() {
    if (useFallback) {
      return Promise.reject(new Error("IndexedDB disabled"));
    }
    if (!dbPromise) {
      if (typeof indexedDB === "undefined") {
        useFallback = true;
        return Promise.reject(new Error("IndexedDB not supported"));
      }
      dbPromise = new Promise((resolve, reject) => {
        let request;
        try {
          request = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (error) {
          useFallback = true;
          reject(error);
          return;
        }
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("cards")) {
            db.createObjectStore("cards", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("connections")) {
            db.createObjectStore("connections", { keyPath: "id" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          useFallback = true;
          reject(request.error);
        };
      });
    }
    return dbPromise;
  }

  function getAll(storeName) {
    return getDB()
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
          })
      )
      .catch((error) => {
        useFallback = true;
        console.warn("IndexedDB read failed, using fallback storage.", error);
        return fallback.loadState().then((state) => state[storeName] || []);
      });
  }

  function putValue(storeName, value) {
    return getDB()
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.objectStore(storeName).put(value);
          })
      )
      .catch((error) => {
        useFallback = true;
        console.warn("IndexedDB write failed, using fallback storage.", error);
        if (storeName === "cards") {
          return fallback.saveCard(value);
        }
        if (storeName === "connections") {
          return fallback.saveConnection(value);
        }
        return Promise.resolve();
      });
  }

  function bulkPut(storeName, values) {
    if (!values.length) return Promise.resolve();
    return getDB()
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            values.forEach((val) => store.put(val));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          })
      )
      .catch((error) => {
        useFallback = true;
        console.warn(
          "IndexedDB bulk write failed, using fallback storage.",
          error
        );
        if (storeName === "cards") {
          return fallback.saveMany(storeName, values);
        }
        if (storeName === "connections") {
          return fallback.saveMany(storeName, values);
        }
        return Promise.resolve();
      });
  }

  function deleteValue(storeName, key) {
    return getDB()
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.objectStore(storeName).delete(key);
          })
      )
      .catch((error) => {
        useFallback = true;
        console.warn("IndexedDB delete failed, using fallback storage.", error);
        if (storeName === "connections") {
          return fallback.deleteConnection(key);
        }
        if (storeName === "cards") {
          return fallback.deleteCard
            ? fallback.deleteCard(key)
            : Promise.resolve();
        }
        return Promise.resolve();
      });
  }

  return {
    loadState: async () => {
      if (useFallback) {
        return fallback.loadState();
      }
      try {
        const [cards, connections] = await Promise.all([
          getAll("cards"),
          getAll("connections"),
        ]);
        return { cards, connections };
      } catch (error) {
        useFallback = true;
        console.warn(
          "IndexedDB unavailable, switching to fallback storage.",
          error
        );
        return fallback.loadState();
      }
    },
    saveCard: (card) =>
      useFallback ? fallback.saveCard(card) : putValue("cards", card),
    saveMany: (storeName, values) =>
      useFallback
        ? fallback.saveMany(storeName, values)
        : bulkPut(storeName, values),
    saveConnection: (connection) =>
      useFallback
        ? fallback.saveConnection(connection)
        : putValue("connections", connection),
    deleteConnection: (id) =>
      useFallback
        ? fallback.deleteConnection(id)
        : deleteValue("connections", id),
    deleteCard: (id) =>
      useFallback ? fallback.deleteCard(id) : deleteValue("cards", id),
  };
}

function createLocalStorageAdapter() {
  const KEY = "canvas-links-fallback";
  const memory = { cards: [], connections: [] };
  const hasLocalStorage = (() => {
    try {
      const testKey = "__canvas-test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      console.warn(
        "localStorage unavailable, using memory-only persistence.",
        error
      );
      return false;
    }
  })();

  function readSnapshot() {
    if (hasLocalStorage) {
      try {
        const raw = window.localStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          memory.cards = parsed.cards || [];
          memory.connections = parsed.connections || [];
        }
      } catch (error) {
        console.warn(
          "localStorage read failed, falling back to memory.",
          error
        );
      }
    }
    return memory;
  }

  function writeSnapshot() {
    if (!hasLocalStorage) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(memory));
    } catch (error) {
      console.warn(
        "localStorage write failed, keeping data in memory only.",
        error
      );
    }
  }

  function cloneState() {
    return {
      cards: memory.cards.map((card) => ({ ...card })),
      connections: memory.connections.map((conn) => ({ ...conn })),
    };
  }

  function upsert(list, item) {
    const index = list.findIndex((entry) => entry.id === item.id);
    if (index >= 0) {
      list[index] = { ...item };
    } else {
      list.push({ ...item });
    }
  }

  function removeById(list, id) {
    const index = list.findIndex((entry) => entry.id === id);
    if (index >= 0) {
      list.splice(index, 1);
    }
  }

  return {
    loadState: async () => {
      readSnapshot();
      return cloneState();
    },
    saveCard: async (card) => {
      readSnapshot();
      upsert(memory.cards, card);
      writeSnapshot();
    },
    saveMany: async (storeName, values) => {
      readSnapshot();
      memory[storeName] = values.map((value) => ({ ...value }));
      writeSnapshot();
    },
    saveConnection: async (connection) => {
      readSnapshot();
      upsert(memory.connections, connection);
      writeSnapshot();
    },
    deleteConnection: async (id) => {
      readSnapshot();
      removeById(memory.connections, id);
      writeSnapshot();
    },
    deleteCard: async (id) => {
      readSnapshot();
      removeById(memory.cards, id);
      memory.connections = memory.connections.filter(
        (conn) => conn.fromId !== id && conn.toId !== id
      );
      writeSnapshot();
    },
  };
}

function persist(promise) {
  if (promise && typeof promise.catch === "function") {
    promise.catch((error) => console.warn("Persistence failed:", error));
  }
}
