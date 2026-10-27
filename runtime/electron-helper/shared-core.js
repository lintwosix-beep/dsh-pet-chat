var PetShared = (function(exports) {

"use strict";

//#region src/shared/constants.ts
const CANVAS_H = 360;
const FEET_Y = 330;
const HIT_BOX = {
	x0: 200,
	y0: 50,
	x1: 440,
	y1: 335
};
const DRAG_THRESHOLD = 5;
const SLINGSHOT_DOUBLE_MS = 200;
const PET_REF_WIDTH = 462;
const ANIMATION_EXT = ".webm";

//#endregion
//#region src/shared/pickers.ts
const pick = (pool, exclude) => {
	const entries = exclude ? pool.filter((n) => n !== exclude) : pool;
	const src = entries.length ? entries : pool;
	return src[Math.floor(Math.random() * src.length)];
};
const pickSlot = (slot, exclude) => {
	if (typeof slot === "string") return slot;
	const entries = exclude === void 0 ? slot : slot.filter((n) => n !== exclude);
	const src = entries.length ? entries : slot;
	return src[Math.floor(Math.random() * src.length)];
};
const slotIncludes = (slot, anim) => typeof slot === "string" ? slot === anim : slot.includes(anim);
const poolIncludes = (pool, anim) => pool.some((slot) => slotIncludes(slot, anim));
const isEventAnim = (events, anim) => events ? Object.values(events).some((pool) => poolIncludes(pool, anim)) : false;
const nextWorkStatusAnim = (pool, current) => {
	const idx = pool.findIndex((slot$1) => slotIncludes(slot$1, current));
	if (idx === -1) return null;
	const slot = pool[idx];
	if (!Array.isArray(slot) || slot.length <= 1) return null;
	return pickSlot(slot, current);
};
const randomBetween = (min, max) => Math.floor(min + Math.random() * (max - min));
const pickWeightedCategory = (categories, facing) => {
	const cats = categories.filter((c) => c.actions.length > 0);
	if (!cats.length) return null;
	const filtered = cats.filter((c) => !(c.noMirror && facing === "right"));
	const eligible = filtered.length ? filtered : cats;
	const totalW = eligible.reduce((s, c) => s + c.weight, 0) || 1;
	let t = Math.random() * totalW;
	for (const c of eligible) {
		t -= c.weight;
		if (t <= 0) return c;
	}
	return eligible[eligible.length - 1];
};
const rollKind = (roll, w, opts) => {
	const turn = opts?.fixed ? 0 : w.turn;
	const move = opts?.fixed ? 0 : w.move;
	const topEnd = (w.idle + turn + move) / 100;
	if (roll < w.idle / 100) return "idle";
	if (roll < (w.idle + turn) / 100) return "turn";
	if (roll < topEnd) return "move";
	return "action";
};
const pickCategoryAction = (categories, idlePool, facing, current) => {
	const cat = pickWeightedCategory(categories, facing);
	if (!cat) return {
		id: "FALLBACK",
		name: pick(idlePool, current)
	};
	return {
		id: cat.id,
		name: pick(cat.actions, current)
	};
};

//#endregion
//#region src/shared/displays.ts
const rectRight = (r) => r.x + r.width;
const rectBottom = (r) => r.y + r.height;
const boundingRect = (rects) => {
	if (rects.length === 0) return {
		x: 0,
		y: 0,
		width: 0,
		height: 0
	};
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (const r of rects) {
		x0 = Math.min(x0, r.x);
		y0 = Math.min(y0, r.y);
		x1 = Math.max(x1, rectRight(r));
		y1 = Math.max(y1, rectBottom(r));
	}
	return {
		x: x0,
		y: y0,
		width: x1 - x0,
		height: y1 - y0
	};
};
const pointInRect = (r, x, y) => x >= r.x && x < rectRight(r) && y >= r.y && y < rectBottom(r);
const rectAtPoint = (rects, x, y) => {
	for (const r of rects) if (pointInRect(r, x, y)) return r;
	return null;
};
const indexAtPoint = (rects, x, y) => {
	for (let i = 0; i < rects.length; i++) if (pointInRect(rects[i], x, y)) return i;
	return -1;
};
const distToRectSq = (r, x, y) => {
	const dx = Math.max(r.x - x, 0, x - rectRight(r));
	const dy = Math.max(r.y - y, 0, y - rectBottom(r));
	return dx * dx + dy * dy;
};
const nearestIndex = (rects, x, y) => {
	let best = -1;
	let bestD = Infinity;
	for (let i = 0; i < rects.length; i++) {
		const d = distToRectSq(rects[i], x, y);
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	}
	return best;
};
const resolveRect = (rects, x, y) => {
	const hit = rectAtPoint(rects, x, y);
	if (hit) return hit;
	const i = nearestIndex(rects, x, y);
	return i < 0 ? null : rects[i];
};
const clampPointInRect = (r, x, y) => ({
	x: Math.min(Math.max(x, r.x), rectRight(r) - 1),
	y: Math.min(Math.max(y, r.y), rectBottom(r) - 1)
});
const clampPointToRegion = (rects, x, y) => {
	if (rectAtPoint(rects, x, y)) return {
		x,
		y
	};
	const i = nearestIndex(rects, x, y);
	return i < 0 ? {
		x,
		y
	} : clampPointInRect(rects[i], x, y);
};
const regionArea = (rects) => rects.reduce((s, r) => s + r.width * r.height, 0);
const regionHoleRatio = (rects) => {
	const hull = boundingRect(rects);
	const hullArea = hull.width * hull.height;
	if (hullArea <= 0) return 0;
	return Math.max(0, 1 - regionArea(rects) / hullArea);
};
const translateRects = (rects, dx, dy) => rects.map((r) => ({
	x: r.x + dx,
	y: r.y + dy,
	width: r.width,
	height: r.height
}));

//#endregion
//#region src/shared/motion.ts
const planMove = (o) => {
	const side = o.sideAllow ?? 0;
	const distance = randomBetween(o.minDist, o.maxDist);
	const target = o.cx + o.dir * distance;
	if (o.areas && o.areas.length > 0) {
		const bodyHalf = o.halfW - side;
		if (!rectAtPoint(o.areas, target - bodyHalf - o.margin, o.cy)) return null;
		if (!rectAtPoint(o.areas, target + bodyHalf + o.margin, o.cy)) return null;
	} else {
		const leftBound = o.margin + o.halfW - side;
		const rightBound = o.W - o.margin - o.halfW + side;
		if (target < leftBound || target > rightBound) return null;
	}
	return {
		startRatio: o.cx / o.W,
		startYRatio: o.cy / o.H,
		targetRatio: target / o.W,
		totalRatio: Math.abs(target - o.cx) / o.W
	};
};
const anchorPixel = (o) => {
	const height = o.size * 9 / 16;
	const a = o.area ?? {
		x: 0,
		y: 0,
		width: o.W,
		height: o.H
	};
	const left = a.x + o.marginX;
	const top = a.y + o.marginY;
	const right = a.x + a.width - o.size - o.marginX;
	const bottom = a.y + a.height - height - o.marginY;
	switch (o.corner) {
		case "top-left": return {
			x: left,
			y: top
		};
		case "top-right": return {
			x: right,
			y: top
		};
		case "bottom-left": return {
			x: left,
			y: bottom
		};
		case "bottom-right": return {
			x: right,
			y: bottom
		};
	}
};

//#endregion
//#region src/shared/balance/tone.ts
const QUOTA_WARN_PERCENT = 70;
const QUOTA_CRIT_PERCENT = 90;
function quotaTone(percent) {
	if (percent >= QUOTA_CRIT_PERCENT) return "crit";
	if (percent >= QUOTA_WARN_PERCENT) return "warn";
	return "ok";
}

//#endregion
//#region src/shared/balance/parse.ts
/**
* 可选数字：缺省 → undefined；出现但非法 → null（调用方据此整拍跳过——不把 NaN/字符串送进展示层）。
*/
function optNum(value) {
	if (value === void 0 || value === null) return void 0;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}
function toBalanceState(raw) {
	if (!raw || typeof raw !== "object") return null;
	const r = raw;
	const provider = String(r.provider ?? "unknown");
	if (r.ok !== true) {
		const reason = r.reason === "unsupported" || r.reason === "credential-missing" || r.reason === "fetch-error" ? r.reason : "fetch-error";
		return {
			provider,
			ok: false,
			reason,
			message: typeof r.message === "string" ? r.message : void 0
		};
	}
	const d = r.data;
	if (!d || typeof d !== "object") return null;
	if (r.shape === "windows") {
		const monthly = optNum(d.monthly);
		const rolling = optNum(d.rolling);
		const weekly = optNum(d.weekly);
		const rollingCapUsd = optNum(d.rollingCapUsd);
		const weeklyCapUsd = optNum(d.weeklyCapUsd);
		const monthlyCapUsd = optNum(d.monthlyCapUsd);
		if (monthly === void 0 || monthly === null) return null;
		if (rolling === null || weekly === null || rollingCapUsd === null || weeklyCapUsd === null || monthlyCapUsd === null) return null;
		return {
			provider,
			shape: "windows",
			ok: true,
			rolling,
			weekly,
			monthly,
			rollingCapUsd,
			weeklyCapUsd,
			monthlyCapUsd,
			rollingLabel: typeof d.rollingLabel === "string" && d.rollingLabel.length > 0 ? d.rollingLabel : void 0,
			rollingResetsAt: typeof d.rollingResetsAt === "string" ? d.rollingResetsAt : void 0,
			weeklyResetsAt: typeof d.weeklyResetsAt === "string" ? d.weeklyResetsAt : void 0,
			monthlyResetsAt: typeof d.monthlyResetsAt === "string" ? d.monthlyResetsAt : void 0
		};
	}
	if (r.shape === "money") {
		const raw$1 = Array.isArray(d.wallets) ? d.wallets : [];
		const wallets = [];
		for (const item of raw$1) {
			if (!item || typeof item !== "object") continue;
			const w = item;
			if (typeof w.currency !== "string" || w.currency.length === 0) continue;
			if (typeof w.total !== "string" || w.total.length === 0) continue;
			wallets.push({
				currency: w.currency,
				total: w.total,
				granted: typeof w.granted === "string" && w.granted.length > 0 ? w.granted : "0.00",
				toppedUp: typeof w.toppedUp === "string" && w.toppedUp.length > 0 ? w.toppedUp : "0.00",
				fullBalance: typeof w.fullBalance === "string" && w.fullBalance.length > 0 ? w.fullBalance : void 0
			});
		}
		if (wallets.length === 0) return null;
		return {
			provider,
			shape: "money",
			ok: true,
			wallets,
			tier: d.tier === "peak" || d.tier === "idle" ? d.tier : void 0
		};
	}
	if (r.shape === "points") {
		if (typeof d.unit !== "string" || d.unit.length === 0) return null;
		if (typeof d.total !== "string" || d.total.length === 0) return null;
		return {
			provider,
			shape: "points",
			ok: true,
			points: {
				unit: d.unit,
				total: d.total,
				full: typeof d.full === "string" && d.full.length > 0 ? d.full : void 0
			}
		};
	}
	return null;
}

//#endregion
//#region src/shared/balance/handlers/money.ts
/**
* money：各币种按**自己的基准**（`fullBalance`）算「剩余比例」，再相加折算成已用百分比。
* 没有基准的币种跳过（不参与折算，不替它猜一个）；一个带基准的都没有 → undefined（不播档位）。
*/
function moneyPercent(v) {
	let remaining = 0;
	let based = 0;
	for (const w of v.wallets ?? []) {
		const total = Number(w.total);
		const full = Number(w.fullBalance);
		if (!Number.isFinite(total) || !Number.isFinite(full) || full <= 0) continue;
		remaining += total / full;
		based++;
	}
	if (based === 0) return void 0;
	return Math.max(0, Math.min(100, 100 - remaining * 100));
}
/**
* money：一行「余额（峰/谷）¥x.xx」。
*
* 只显示 `total !== 0` 的币种（**负数要显示**——透支是真的欠钱；正好 0 的不占地方），
* CNY 优先，用符号拼、`/` 分隔；全都为 0 时兜底显示主币种 ¥0.00（否则气泡会空一行）。
* 档位装饰（峰/谷）只有提供该计价规则的服务商才有；没有就不加括号那一段。
*/
function moneyRows(v) {
	const visible = (v.wallets ?? []).filter((w) => Number(w.total) !== 0).sort((a, b) => (a.currency === "CNY" ? 0 : 1) - (b.currency === "CNY" ? 0 : 1));
	const amount = visible.length > 0 ? visible.map((w) => (w.currency === "USD" ? "$" : "¥") + w.total).join("/") : "¥0.00";
	if (!v.tier) return [{
		role: "label",
		text: "余额 " + amount
	}];
	return [
		{
			role: "label",
			text: "余额（"
		},
		{
			role: "tier",
			tier: v.tier,
			text: v.tier === "peak" ? "峰" : "谷"
		},
		{
			role: "label",
			text: "）" + amount
		}
	];
}
const moneyHandler = {
	percent: moneyPercent,
	rows: moneyRows
};

//#endregion
//#region src/shared/balance/handlers/points.ts
/**
* points：与 money 同一套「按基准折算」的数学，数据来自 `points` 而非 `wallets`。
* 没有基准 / 基准非法 → undefined（不播档位，不替服务商猜一个）。
*/
function pointsPercent(v) {
	const total = Number(v.points?.total);
	const full = Number(v.points?.full);
	if (!Number.isFinite(total) || !Number.isFinite(full) || full <= 0) return void 0;
	return Math.max(0, Math.min(100, 100 - total / full * 100));
}
/**
* points：一行「余额 800 积分」。
* 单位是数据带出的后缀，**绝不套货币符号**（`currency` 那套 $/¥ 判断只属于 money）。
* 0 也照常显示：0 积分是真实读数。
*/
function pointsRows(v) {
	const p = v.points;
	if (!p) return [{
		role: "label",
		text: "积分数据不可用"
	}];
	return [{
		role: "label",
		text: "余额 " + p.total + " " + p.unit
	}];
}
const pointsHandler = {
	percent: pointsPercent,
	rows: pointsRows
};

//#endregion
//#region src/shared/balance/handlers/windows.ts
const WINDOW_LABELS = {
	weekly: "周",
	monthly: "月"
};
const DEFAULT_ROLLING_LABEL = "5h";
/** 窗口展示名：滚动窗取服务商自报值（缺省 5h），周/月走固定表 */
function windowLabel(v, w) {
	if (w === "rolling") return v.rollingLabel ?? DEFAULT_ROLLING_LABEL;
	return WINDOW_LABELS[w];
}
/** 各窗口的满额度（USD）：全部来自数据（展示层不写死任何服务商的额度） */
function windowQuotas(v) {
	return {
		rolling: v.rollingCapUsd,
		weekly: v.weeklyCapUsd,
		monthly: v.monthlyCapUsd
	};
}
function urgentWindow(v) {
	if (v.shape !== "windows") return void 0;
	const quotas = windowQuotas(v);
	const resets = {
		rolling: v.rollingResetsAt,
		weekly: v.weeklyResetsAt,
		monthly: v.monthlyResetsAt
	};
	const present = [
		"rolling",
		"weekly",
		"monthly"
	].filter((w) => v[w] !== void 0);
	if (present.length === 0) return void 0;
	const allQuotas = present.every((w) => {
		const quota = quotas[w];
		return quota !== void 0 && quota > 0;
	});
	let best;
	for (const w of present) {
		const percent = v[w] ?? 0;
		const quota = quotas[w];
		const cand = {
			label: windowLabel(v, w),
			percent,
			quotaUsd: quota,
			remainingUsd: allQuotas && quota !== void 0 ? quota * (100 - percent) / 100 : void 0,
			resetsAt: resets[w]
		};
		if (best === void 0) {
			best = cand;
			continue;
		}
		const moreUrgent = allQuotas ? (cand.remainingUsd ?? 0) < (best.remainingUsd ?? 0) : cand.percent > best.percent;
		if (moreUrgent) best = cand;
	}
	return best;
}
function resetInText(iso) {
	if (!iso) return "";
	const t = new Date(iso).getTime();
	if (!Number.isFinite(t)) return "";
	const delta = t - Date.now();
	if (delta <= 0) return "已重置";
	const hoursF = delta / 36e5;
	if (hoursF >= 96) return (Math.round(hoursF / 24 * 10) / 10).toFixed(1) + " 天";
	return Math.max(.1, Math.round(hoursF * 10) / 10).toFixed(1) + " 小时";
}
/** windows：三窗口取最大（只有月窗口时就是它自己） */
function windowsPercent(v) {
	return Math.max(v.rolling ?? 0, v.weekly ?? 0, v.monthly ?? 0);
}
/** windows：两行 —— 最紧迫窗口的「已用 N%」+ 重置倒计时 */
function windowsRows(v) {
	const w = urgentWindow(v);
	if (!w) return [{
		role: "label",
		text: "额度数据不可用"
	}];
	const reset = resetInText(w.resetsAt);
	return [{
		role: "label",
		text: w.label + "额度已用 " + Math.round(w.percent) + "%"
	}, {
		role: "sub",
		text: reset ? reset + "重置" : "已重置"
	}];
}
/**
* windows：展开态每个存在窗口一行 —— 窗口名 + 进度条 + 已用百分比 + 重置倒计时。
* 只列**存在**的窗口：`rolling` / `weekly` 缺省 = 该服务商没有这个窗口，不补 0、不画空条。
*/
function windowsDetail(v) {
	const resets = {
		rolling: v.rollingResetsAt,
		weekly: v.weeklyResetsAt,
		monthly: v.monthlyResetsAt
	};
	const rows = [];
	for (const w of [
		"rolling",
		"weekly",
		"monthly"
	]) {
		const percent = v[w];
		if (percent === void 0) continue;
		const reset = resetInText(resets[w]);
		const usedText = Math.round(percent) + "%";
		const resetText = reset === "" ? "已重置" : reset + "重置";
		rows.push({
			role: "quota",
			text: windowLabel(v, w) + " " + usedText + " " + resetText,
			label: windowLabel(v, w),
			percent,
			tone: quotaTone(percent),
			usedText,
			resetText
		});
	}
	return rows.length > 0 ? rows : windowsRows(v);
}
const windowsHandler = {
	percent: windowsPercent,
	rows: windowsRows,
	detail: windowsDetail
};

//#endregion
//#region src/shared/balance/handlers/index.ts
const HANDLERS = {
	windows: windowsHandler,
	money: moneyHandler,
	points: pointsHandler
};

//#endregion
//#region src/shared/balance/percent.ts
function balancePercent(v) {
	return HANDLERS[v.shape].percent(v);
}
function balanceEventIndex(p) {
	if (p === 100) return 5;
	const i = Math.floor(p / 20);
	return i < 5 ? i : 4;
}

//#endregion
//#region src/shared/balance/view.ts
/** 不可用状态的气泡行（显式说明原因，绝不伪造数字）：
*  - unsupported：服务商未登记查询接口（配置事实，不是故障）→ 报出 provider id，便于自查"当前到底是谁"
*  - credential-missing：缺凭证 → 次要行放 host 报的凭证名（不含 message 时不留空行）
*  - fetch-error：抓取失败 → 次要行放底层错误
* 次要行为空的会被剔除：空 div 在气泡里会白占一行高度。 */
function unavailableRows(state) {
	const rows = state.reason === "unsupported" ? [{
		role: "error",
		text: "当前服务商暂不支持余额查询"
	}, {
		role: "sub",
		text: "当前服务商：" + state.provider
	}] : state.reason === "credential-missing" ? [{
		role: "error",
		text: "缺少余额查询凭证"
	}, {
		role: "sub",
		text: state.message ?? ""
	}] : [{
		role: "error",
		text: "余额查询失败"
	}, {
		role: "sub",
		text: state.message ?? ""
	}];
	return rows.filter((r) => r.role !== "quota" && r.text !== "");
}
function balanceBubbleView(state) {
	if (!state.ok) return unavailableRows(state);
	return HANDLERS[state.shape].rows(state);
}
function balanceDetailView(state) {
	if (!state.ok) return unavailableRows(state);
	const handler = HANDLERS[state.shape];
	return handler.detail ? handler.detail(state) : handler.rows(state);
}

//#endregion
//#region src/shared/balance/notice.ts
function decideBalanceNotice(state, lastKey, explicit) {
	if (state.ok) return {
		show: false,
		key: null
	};
	const key = state.reason + ":" + state.provider;
	return {
		show: explicit || key !== lastKey,
		key
	};
}

//#endregion
//#region src/shared/whisper.ts
function whisperBubbleView(state) {
	if (state.ok) return [{
		role: "label",
		text: state.text
	}];
	const msg = state.reason === "provider-missing" ? "当前对话未配置模型，碎碎念不可用" : "碎碎念生成失败" + (state.message ? "：" + state.message : "");
	return [{
		role: "label",
		text: msg
	}];
}
function memeImageUrl(name, base = "/dsh-pet-7340", assetRoot = "") {
	const root = String(assetRoot ?? "").trim();
	const prefix = root ? "/pic/memes/" + encodeURIComponent(root) : "/pic/memes";
	return base + prefix + "/" + encodeURIComponent(name) + ".png";
}
const MEME_IMG_CLASS = "pet-bub-img";
const MEME_BUBBLE_CLASS = "has-img";
const MEME_BUBBLE_CSS = [".pet-bub-img{--m:var(--f,calc(var(--dsh-pet-size,var(--pet-size,462px))*0.0455));display:block;width:calc(var(--m)*7.4725);max-width:100%;height:auto;border-radius:calc(var(--m)*0.5714);margin:0 auto calc(var(--m)*0.3736);object-fit:cover;pointer-events:none;user-select:none}", ".pet-bubble.has-img,.dsh-pet-bubble.has-img{min-width:0}"].join("");
/** 只注入一次（两端共用；页面已有同一标记则跳过） */
let memeCssInjected = false;
function injectMemeBubbleCss() {
	if (memeCssInjected || typeof document === "undefined") return;
	memeCssInjected = true;
	if (document.querySelector("style[data-plugin-css=\"dsh-pet/meme-bubble\"]") !== null) return;
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-pet";
	tag.dataset.pluginCss = "dsh-pet/meme-bubble";
	tag.textContent = MEME_BUBBLE_CSS;
	document.head.appendChild(tag);
}
function createMemeImage(name, base = "/dsh-pet-7340", assetRoot = "") {
	const key = String(name ?? "").trim();
	if (!key) return null;
	injectMemeBubbleCss();
	const img = document.createElement("img");
	img.className = MEME_IMG_CLASS;
	img.src = memeImageUrl(key, base, assetRoot);
	img.alt = key;
	return img;
}
function createMemeImageFromUrl(url) {
	const href = String(url ?? "").trim();
	if (!href) return null;
	injectMemeBubbleCss();
	const img = document.createElement("img");
	img.className = MEME_IMG_CLASS;
	img.src = href;
	img.alt = "";
	return img;
}

//#endregion
//#region src/shared/config.ts
const PET_DISPLAYS = [
	"web",
	"desktop",
	"both",
	"none"
];
const isWebVisible = (display) => display === "web" || display === "both";
const isDesktopVisible = (display) => display === "desktop" || display === "both";
function flattenConfigPets(merged) {
	const out = [];
	for (const [entry, conf] of Object.entries(merged)) {
		const list = Array.isArray(conf?.pets) ? conf.pets : [];
		for (const p of list) out.push({
			...p,
			animations: conf.animations,
			animationWeights: conf.animationWeights,
			eventsRefreshSec: conf.eventsRefreshSec,
			physics: conf.physics,
			font: conf.font,
			confineToScreen: conf.confineToScreen,
			workStatusTexts: conf.workStatusTexts,
			whisperModel: conf.whisperModel,
			chatModel: conf.chatModel,
			assetRoot: entry,
			extra: entry !== "main"
		});
	}
	return out;
}

//#endregion
//#region src/shared/fonts.ts
const FONT_PRESETS = [
	{
		id: "candy",
		stack: "\"ShangshouSoftCandy\",\"Yuanti SC\",\"YouYuan\",\"幼圆\",\"Comic Sans MS\",\"PingFang SC\",\"Microsoft YaHei\",sans-serif"
	},
	{
		id: "yahei",
		stack: "\"Microsoft YaHei\",\"PingFang SC\",sans-serif"
	},
	{
		id: "youyuan",
		stack: "\"YouYuan\",\"Yuanti SC\",sans-serif"
	},
	{
		id: "kaiti",
		stack: "\"KaiTi\",\"STKaiti\",serif"
	},
	{
		id: "simsun",
		stack: "\"SimSun\",\"Songti SC\",serif"
	},
	{
		id: "comic",
		stack: "\"Comic Sans MS\",\"Comic Sans\",cursive"
	},
	{
		id: "system",
		stack: "system-ui,sans-serif"
	}
];
const FONT_SIZE_MIN = 4;
const FONT_SIZE_MAX = 200;
const DEFAULT_FONT = {
	family: "candy",
	size: 21,
	followPet: true
};
function fontStackOf(id) {
	return (FONT_PRESETS.find((p) => p.id === id) ?? FONT_PRESETS[0]).stack;
}
const FONT_REF_SIZE = 462;
const BUBBLE_FONT_BASE_PX = .0455 * FONT_REF_SIZE;
const TIP_FONT_BASE_PX = .026 * FONT_REF_SIZE;
function resolveFontPx(font, size) {
	const own = Number(font?.size);
	const ratio = Number.isFinite(own) && own > 0 ? own / DEFAULT_FONT.size : 1;
	const w = Number(size);
	const follow = font?.followPet !== false;
	const scale = follow && Number.isFinite(w) && w > 0 ? w / FONT_REF_SIZE : 1;
	return {
		bubble: BUBBLE_FONT_BASE_PX * ratio * scale,
		tip: TIP_FONT_BASE_PX * ratio * scale
	};
}
const BUBBLE_OVERLAP_RATIO = .108;
const BUBBLE_METRICS = {
	lineHeight: 1.6,
	padY: .4835,
	subScale: .7692,
	imgWidth: 7.4725,
	imgMargin: .3736,
	imgMaxRatio: 1
};
function bubbleMaxHeightPx(font, size) {
	const f = resolveFontPx(font, size).bubble;
	const m = BUBBLE_METRICS;
	return m.padY * 2 * f + m.lineHeight * f + m.lineHeight * m.subScale * f + m.imgWidth * m.imgMaxRatio * f + m.imgMargin * f;
}
function bubbleTopMarginPx(font, size) {
	const overlap = (Number(size) || 0) * BUBBLE_OVERLAP_RATIO;
	return Math.max(0, Math.ceil(bubbleMaxHeightPx(font, size) - overlap));
}

//#endregion
//#region src/shared/notify.ts
const NOTIFY_ICONS = {
	done: "notify-done",
	error: "notify-error",
	truncated: "notify-truncated",
	approval: "notify-approval",
	question: "notify-question",
	test: "notify-test"
};
const MAX_BODY = 80;
function truncate(text) {
	return text.length > MAX_BODY ? text.slice(0, MAX_BODY) + "…" : text;
}
function frameToToast(frame) {
	switch (frame.type) {
		case "session/event": {
			const ev = frame.event ?? {};
			if (ev.type !== "turn/end") return null;
			const kind = ev.data?.reason?.kind;
			if (kind === "completed") return {
				title: "对话完成",
				body: "",
				icon: NOTIFY_ICONS.done
			};
			if (kind === "error") return {
				title: "生成失败",
				body: ev.data?.reason?.error?.message ?? "",
				icon: NOTIFY_ICONS.error
			};
			if (kind === "max-tokens") return {
				title: "输出被截断",
				body: "已达到输出 token 上限",
				icon: NOTIFY_ICONS.truncated
			};
			return null;
		}
		case "approval/requested": {
			const toolName = typeof frame.toolName === "string" ? frame.toolName : "";
			const reason = typeof frame.reason === "string" && frame.reason ? frame.reason : "";
			return {
				title: "正在申请权限",
				body: (toolName ? "工具「" + toolName + "」" : "") + (reason ? "：" + reason : ""),
				icon: NOTIFY_ICONS.approval
			};
		}
		case "question/requested": {
			const q = Array.isArray(frame.questions) && frame.questions[0]?.question || "";
			return {
				title: "模型在等你回答",
				body: q,
				icon: NOTIFY_ICONS.question
			};
		}
		case "host/agent-error": return {
			title: "生成失败",
			body: typeof frame.message === "string" ? frame.message : "",
			icon: NOTIFY_ICONS.error
		};
		default: return null;
	}
}

//#endregion
//#region src/shared/menu.ts
const displayMenuBranch = () => ({
	label: "显示位置",
	children: [
		{
			label: "仅网页",
			action: "set-display",
			display: "web"
		},
		{
			label: "仅桌面",
			action: "set-display",
			display: "desktop"
		},
		{
			label: "两者",
			action: "set-display",
			display: "both"
		},
		{
			label: "都不",
			action: "set-display",
			display: "none"
		}
	]
});
const MORE_MENU_LABEL = "更多";
function readMenuItems(data) {
	if (!data || typeof data !== "object") return [];
	const items = data.items;
	if (!Array.isArray(items)) return [];
	const out = [];
	for (const item of items) {
		if (!item || typeof item !== "object") continue;
		const owner = item.owner;
		const label = item.label;
		if (typeof owner === "string" && owner !== "" && typeof label === "string" && label !== "") out.push({
			owner,
			label
		});
	}
	return out;
}
function buildMoreBranch(items) {
	const groups = new Map();
	for (const item of items) {
		const list = groups.get(item.owner);
		if (list) list.push(item.label);
		else groups.set(item.owner, [item.label]);
	}
	const children = [];
	for (const [owner, labels] of groups) if (labels.length === 1) children.push({
		label: labels[0],
		action: "third-party",
		owner
	});
	else children.push({
		label: owner,
		children: labels.map((label) => ({
			label,
			action: "third-party",
			owner
		}))
	});
	return children.length > 0 ? {
		label: MORE_MENU_LABEL,
		children
	} : null;
}
/** 事件名 → 分类标签（无映射时用事件名本身） */
const EVENT_LABELS = {
	balance: "余额档位",
	whisper: "碎碎念",
	workStatus: "工作状态"
};
const leaf = (anim) => ({
	label: anim,
	anim
});
function buildMenuTree(animations) {
	const groups = [];
	const pools = [
		["待机", animations.idle],
		["转向", animations.turn],
		["拖拽", animations.drag],
		["点击回应", animations.clicks],
		["移动", animations.moves.actions.map((m) => m.name)]
	];
	for (const [label, pool] of pools) if (pool.length) groups.push({
		label,
		children: pool.map(leaf)
	});
	const cats = (animations.categories ?? []).filter((c) => c.actions.length > 0);
	for (const c of cats) groups.push({
		label: c.id,
		children: c.actions.map(leaf)
	});
	const events = animations.events ?? {};
	for (const key of Object.keys(events)) {
		const pool = events[key] ?? [];
		const names = [];
		for (const slot of pool) if (typeof slot === "string") names.push(slot);
		else names.push(...slot);
		if (names.length) groups.push({
			label: EVENT_LABELS[key] ?? key,
			children: names.map(leaf)
		});
	}
	if (!groups.length) return [];
	return [{
		label: "动作",
		children: groups
	}];
}
function isNoMirrorAnimation(categories, anim) {
	return (categories ?? []).some((c) => c.noMirror === true && c.actions.includes(anim));
}
const MENU_CSS = [
	".dsh-pet-menu{position:fixed;left:0;top:0;z-index:2147483000;color:#2b2b2b;font-size:13px;line-height:1.5;",
	"font-family:'Microsoft YaHei UI','Segoe UI','PingFang SC',sans-serif;user-select:none;pointer-events:auto}",
	".dsh-pet-menu,.dsh-pet-menu *{box-sizing:border-box}",
	".dsh-pet-menu-column{position:absolute;min-width:150px;max-width:300px;padding:4px;",
	"background:rgba(255,255,255,.98);border:1px solid rgba(0,0,0,.12);border-radius:8px;",
	"box-shadow:0 8px 28px rgba(0,0,0,.2);max-height:min(62vh,460px);overflow-y:auto;",
	"scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.22) transparent}",
	".dsh-pet-menu-column::-webkit-scrollbar{width:8px;height:8px}",
	".dsh-pet-menu-column::-webkit-scrollbar-track{background:transparent}",
	".dsh-pet-menu-column::-webkit-scrollbar-thumb{background:rgba(0,0,0,.16);border-radius:4px;",
	"border:2px solid transparent;background-clip:content-box}",
	".dsh-pet-menu-column::-webkit-scrollbar-thumb:hover{background:rgba(43,99,255,.4);",
	"border:2px solid transparent;background-clip:content-box}",
	".dsh-pet-menu-column::-webkit-scrollbar-corner{background:transparent}",
	".dsh-pet-menu-item{position:relative;display:flex;align-items:center;justify-content:space-between;",
	"gap:14px;padding:5px 12px;border-radius:6px;white-space:nowrap;cursor:default}",
	".dsh-pet-menu-item:hover{background:rgba(43,99,255,.14)}",
	".dsh-pet-menu-item>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis}",
	".dsh-pet-menu-hint{color:#9aa0a6;font-size:12px;flex:none;white-space:nowrap}",
	".dsh-pet-menu-arrow{color:#9aa0a6;font-size:12px;flex:none}"
].join("");
function isBranchNode(n) {
	return "children" in n && Array.isArray(n.children);
}
function mountContextMenu(opts) {
	const { tree, x, y, onAction, onClose, clamp } = opts;
	const c = clamp && Number.isFinite(clamp.x + clamp.y + clamp.w + clamp.h) ? clamp : {
		x: 0,
		y: 0,
		w: window.innerWidth,
		h: window.innerHeight
	};
	const root = document.createElement("div");
	root.className = "dsh-pet-menu";
	root.style.left = "0px";
	root.style.top = "0px";
	root.addEventListener("contextmenu", (e) => e.preventDefault());
	let closed = false;
	/** 每个面板当前展开的子面板（无 = 未展开）；hideChain 会沿链清除 */
	const openChild = new Map();
	/** 指针整体离开菜单树的兜底关闭定时器（root mouseover 重新进入即取消） */
	let leaveTimer = null;
	/** 关闭某面板及其后代面板整条链（display:none + 清 openChild 链） */
	const hideChain = (panel) => {
		panel.style.display = "none";
		const child = openChild.get(panel);
		if (child) {
			openChild.delete(panel);
			hideChain(child);
		}
	};
	/** 把面板显示在触发项旁边：右缘展开，贴右/下边缘自动翻转夹取（在 clamp 矩形内） */
	const showPanel = (panel, item) => {
		const rect = item.getBoundingClientRect();
		panel.style.left = "";
		panel.style.top = "";
		panel.style.display = "block";
		let left = rect.right + 4;
		if (left + panel.offsetWidth > c.x + c.w - 4) left = rect.left - panel.offsetWidth - 4;
		left = Math.max(c.x + 4, left);
		let top = rect.top;
		if (top + panel.offsetHeight > c.y + c.h - 4) top = Math.max(c.y + 4, c.y + c.h - 4 - panel.offsetHeight);
		panel.style.left = left + "px";
		panel.style.top = top + "px";
	};
	/** 构建一层面板（nodes 列表）；分支项的子面板**平级**挂到 root 下，不嵌套。
	*  面板自身先入 DOM、子面板随后入 → 层级越深绘制越靠上（子菜单盖在父菜单上层）。 */
	const buildPanel = (nodes) => {
		const panel = document.createElement("div");
		panel.className = "dsh-pet-menu-column";
		panel.style.display = "none";
		if (clamp) panel.style.maxHeight = Math.min(460, Math.max(120, c.h - 16)) + "px";
		root.appendChild(panel);
		for (const node of nodes) {
			const item = document.createElement("div");
			item.className = "dsh-pet-menu-item";
			if (isBranchNode(node)) {
				item.classList.add("dsh-pet-menu-branch");
				const label = document.createElement("span");
				label.textContent = node.label;
				const arrow = document.createElement("span");
				arrow.className = "dsh-pet-menu-arrow";
				arrow.textContent = "▸";
				item.appendChild(label);
				item.appendChild(arrow);
				const childPanel = buildPanel(node.children);
				item.addEventListener("mouseenter", () => {
					const prev = openChild.get(panel);
					if (prev && prev !== childPanel) hideChain(prev);
					openChild.set(panel, childPanel);
					showPanel(childPanel, item);
				});
			} else {
				const label = document.createElement("span");
				label.textContent = node.label;
				item.appendChild(label);
				if (node.hint) {
					const hint = document.createElement("span");
					hint.className = "dsh-pet-menu-hint";
					hint.textContent = node.hint;
					item.appendChild(hint);
				}
				item.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					close();
					onAction(node);
				});
			}
			panel.appendChild(item);
		}
		return panel;
	};
	const rootPanel = buildPanel(tree);
	rootPanel.style.display = "block";
	document.body.appendChild(root);
	rootPanel.style.left = "";
	rootPanel.style.top = "";
	const rw = rootPanel.offsetWidth;
	const rh = rootPanel.offsetHeight;
	rootPanel.style.left = Math.max(c.x + 4, Math.min(x, c.x + c.w - rw - 4)) + "px";
	rootPanel.style.top = Math.max(c.y + 4, Math.min(y, c.y + c.h - rh - 4)) + "px";
	root.addEventListener("mouseleave", () => {
		if (leaveTimer !== null) window.clearTimeout(leaveTimer);
		leaveTimer = window.setTimeout(() => {
			leaveTimer = null;
			close();
		}, 200);
	});
	root.addEventListener("mouseover", () => {
		if (leaveTimer !== null) {
			window.clearTimeout(leaveTimer);
			leaveTimer = null;
		}
	});
	const onDocPointerDown = (e) => {
		if (closed) return;
		if (root.contains(e.target)) return;
		close();
	};
	const onDocKeyDown = (e) => {
		if (closed) return;
		if (e.key === "Escape") close();
	};
	document.addEventListener("mousedown", onDocPointerDown, true);
	document.addEventListener("keydown", onDocKeyDown, true);
	const close = () => {
		if (closed) return;
		closed = true;
		if (leaveTimer !== null) window.clearTimeout(leaveTimer);
		leaveTimer = null;
		document.removeEventListener("mousedown", onDocPointerDown, true);
		document.removeEventListener("keydown", onDocKeyDown, true);
		root.remove();
		if (onClose) onClose();
	};
	return {
		el: root,
		close
	};
}

//#endregion
//#region src/shared/chat.ts
const SEND_TIMEOUT_MS = 6e4;
async function sendChat(baseUrl, text) {
	const res = await fetch(baseUrl, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ text }),
		signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
	});
	const raw = await res.json().catch(() => null);
	if (!raw || typeof raw !== "object") throw new Error("dsh-pet: 对话响应非法");
	const o = raw;
	if (o.ok !== true) return {
		ok: false,
		reason: o.reason === "provider-missing" || o.reason === "generate-error" || o.reason === "config-error" ? o.reason : "bad-request",
		message: typeof o.message === "string" ? o.message : void 0
	};
	return { ok: true };
}
const CHAT_CSS = [
	".dsh-pet-chat{position:fixed;z-index:2147483001;width:160px;max-width:80vw;",
	"background:rgba(255,255,255,.98);border:1px solid rgba(0,0,0,.12);border-radius:10px;",
	"box-shadow:0 10px 32px rgba(0,0,0,.22);color:#2b2b2b;font-size:14px;line-height:1.5;",
	"font-family:var(--dsh-pet-font-family,'ShangshouSoftCandy','Yuanti SC','YouYuan','幼圆','Comic Sans MS','PingFang SC','Microsoft YaHei',sans-serif);",
	"user-select:none}",
	".dsh-pet-chat *{box-sizing:border-box}",
	".dsh-pet-chat-input{display:block;width:100%;border:none;outline:none;background:transparent;",
	"padding:8px 11px 9px;font-size:14px;line-height:1.45;color:#2b2b2b;font-family:inherit;",
	"resize:none;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere}",
	".dsh-pet-chat-input::placeholder{color:rgba(43,43,43,.45)}",
	".dsh-pet-chat-input:disabled{opacity:.55}",
	".dsh-pet-chat-err{color:#d94f3d;font-size:12px;padding:0 12px 8px;white-space:pre-wrap;overflow-wrap:anywhere}"
].join("");
/** 输入框宽度自适应参数：初始小宽 → 随文本增宽 → 封顶后折行增高 */
const CHAT_MIN_W = 160;
const CHAT_MAX_W = 340;
const CHAT_H_PAD = 22;
let chatCssInjected = false;
function injectChatCss() {
	if (chatCssInjected || typeof document === "undefined") return;
	chatCssInjected = true;
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-pet";
	tag.dataset.pluginCss = "dsh-pet/chat";
	tag.textContent = CHAT_CSS;
	document.head.appendChild(tag);
}
function mountChatDialog(opts) {
	injectChatCss();
	const { petId, surface, x, y, onSent, onClose, clamp } = opts;
	const baseUrl = opts.baseUrl ?? "/dsh-pet-7340/chat";
	const withPet = baseUrl + "?pet=" + encodeURIComponent(petId) + "&surface=" + surface;
	const c = clamp && Number.isFinite(clamp.x + clamp.y + clamp.w + clamp.h) ? clamp : {
		x: 0,
		y: 0,
		w: window.innerWidth,
		h: window.innerHeight
	};
	const root = document.createElement("div");
	root.className = "dsh-pet-chat";
	const input = document.createElement("textarea");
	input.className = "dsh-pet-chat-input";
	input.placeholder = "说点什么…";
	input.maxLength = 2e3;
	input.rows = 1;
	let measureCtx = null;
	const measureText = (text) => {
		const ctx = measureCtx ?? (measureCtx = document.createElement("canvas").getContext("2d"));
		ctx.font = getComputedStyle(input).font;
		return ctx.measureText(text).width;
	};
	const resizeInput = () => {
		const textW = measureText(input.value || " ");
		const w = Math.max(CHAT_MIN_W, Math.min(Math.ceil(textW + CHAT_H_PAD), CHAT_MAX_W));
		root.style.width = w + "px";
		input.style.height = "auto";
		input.style.height = Math.max(input.scrollHeight, 22) + "px";
	};
	input.addEventListener("input", resizeInput);
	resizeInput();
	const err = document.createElement("div");
	err.className = "dsh-pet-chat-err";
	err.style.display = "none";
	root.appendChild(input);
	root.appendChild(err);
	document.body.appendChild(root);
	resizeInput();
	const rr = root.getBoundingClientRect();
	root.style.left = Math.max(c.x + 4, Math.min(x, c.x + c.w - rr.width - 4)) + "px";
	root.style.top = Math.max(c.y + 4, Math.min(y, c.y + c.h - rr.height - 4)) + "px";
	let closed = false;
	let sending = false;
	const close = () => {
		if (closed) return;
		closed = true;
		document.removeEventListener("mousedown", onDocPointerDown, true);
		document.removeEventListener("keydown", onDocKeyDown, true);
		root.remove();
		if (onClose) onClose();
	};
	const onDocPointerDown = (e) => {
		if (closed) return;
		if (root.contains(e.target)) return;
		close();
	};
	const onDocKeyDown = (e) => {
		if (closed) return;
		if (e.key === "Escape") close();
	};
	document.addEventListener("mousedown", onDocPointerDown, true);
	document.addEventListener("keydown", onDocKeyDown, true);
	const doSend = () => {
		if (closed || sending) return;
		const text = input.value.trim();
		if (!text) return;
		sending = true;
		input.disabled = true;
		sendChat(withPet, text).then((state) => {
			if (state.ok) {
				close();
				if (onSent) onSent();
			} else {
				err.textContent = "对话失败：" + (state.message ?? state.reason);
				err.style.display = "block";
			}
		}).catch((e) => {
			err.textContent = "对话异常：" + String(e && e.message ? e.message : e);
			err.style.display = "block";
		}).finally(() => {
			sending = false;
			input.disabled = false;
			if (!closed) input.focus();
		});
	};
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			doSend();
		}
	});
	input.focus();
	return {
		el: root,
		close
	};
}

//#endregion
//#region src/shared/panel.ts
/** 「对话与总结」面板（本地新增）：QQ 风格的聊天记录 + 关键词搜索 + 按日期筛选，纯 DOM，无框架依赖。
 *  为什么另起一个浮层而不是复用聊天输入框：气泡被窗口/屏幕裁到什么程度是不可控的，
 *  长文本要一个能滚动、能一直开着的容器；历史记录同理（memory.json 里已经攒了所有对话与总结）。 */
const PANEL_CLASS = 'dsh-pet-panel';
const PANEL_CSS = [
	'.dsh-pet-panel{position:fixed;z-index:2147483002;display:flex;flex-direction:column;',
	'background:#f2f4f7;border:1px solid rgba(0,0,0,.12);border-radius:14px;',
	'box-shadow:0 18px 48px rgba(0,0,0,.28);color:#2b2b2b;font-size:13.5px;line-height:1.55;',
	"font-family:var(--dsh-pet-font-family,'ShangshouSoftCandy','Yuanti SC','YouYuan','幼圆','Comic Sans MS','PingFang SC','Microsoft YaHei',sans-serif);",
	'overflow:hidden;user-select:text}',
	'.dsh-pet-panel *{box-sizing:border-box}',
	'.dsh-pet-panel-head{display:flex;align-items:center;gap:8px;padding:10px 12px 8px;background:#fff;border-bottom:1px solid rgba(0,0,0,.06);cursor:move;user-select:none}',
	'.dsh-pet-panel-head.is-drag{background:#eef2ff}',
	'.dsh-pet-panel-head .dsh-pet-panel-close{cursor:pointer}',
	'.dsh-pet-panel-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600}',
	'.dsh-pet-panel-close{flex:none;width:24px;height:24px;border:none;border-radius:8px;background:rgba(0,0,0,.05);color:#666;font-size:15px;line-height:1;cursor:pointer}',
	'.dsh-pet-panel-close:hover{background:rgba(0,0,0,.12);color:#222}',
	'.dsh-pet-panel-tabs{display:flex;gap:6px;padding:8px 12px 6px;background:#fff}',
	'.dsh-pet-panel-tab{flex:none;padding:4px 10px;border:none;border-radius:999px;background:rgba(0,0,0,.05);color:#555;font-size:12px;cursor:pointer}',
	'.dsh-pet-panel-tab.is-on{background:#2b6cf0;color:#fff}',
	'.dsh-pet-panel-bar{display:flex;align-items:center;gap:6px;padding:6px 12px 8px;background:#fff;border-bottom:1px solid rgba(0,0,0,.06)}',
	'.dsh-pet-panel-q{flex:1 1 auto;min-width:0;height:26px;padding:0 8px;border:1px solid rgba(0,0,0,.12);border-radius:8px;font-size:12px;color:#333;background:#f7f8fa;outline:none}',
	'.dsh-pet-panel-q:focus{border-color:#2b6cf0;background:#fff}',
	'.dsh-pet-panel-btn{flex:none;height:26px;padding:0 8px;border:1px solid rgba(0,0,0,.12);border-radius:8px;background:#f7f8fa;color:#444;font-size:12px;cursor:pointer;white-space:nowrap}',
	'.dsh-pet-panel-btn:hover{background:#eef2ff;border-color:#b9cdfb}',
	'.dsh-pet-panel-btn.is-on{background:#2b6cf0;border-color:#2b6cf0;color:#fff}',
	'.dsh-pet-panel-date{position:absolute;left:-9999px;top:0;width:1px;height:1px;opacity:0}',
	'.dsh-pet-panel-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:10px 12px 16px;scrollbar-width:thin}',
	'.dsh-pet-panel-count{text-align:center;color:rgba(43,43,43,.45);font-size:11px;margin:0 0 8px}',
	'.dsh-pet-panel-day{display:flex;justify-content:center;margin:8px 0}',
	'.dsh-pet-panel-day span{padding:2px 8px;border-radius:8px;background:rgba(0,0,0,.06);color:rgba(43,43,43,.55);font-size:11px}',
	'.dsh-pet-row{display:flex;align-items:flex-start;gap:8px;margin:0 0 12px}',
	'.dsh-pet-row.is-me{flex-direction:row-reverse}',
	'.dsh-pet-ava{flex:none;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;',
	'font-size:11px;color:#fff;background:#8aa0c9;box-shadow:0 1px 3px rgba(0,0,0,.16);overflow:hidden}',
	'.dsh-pet-ava img{width:100%;height:100%;object-fit:cover;display:block}',
	'.dsh-pet-ava.is-pick{cursor:pointer}',
	'.dsh-pet-panel-set .dsh-pet-panel-av{display:flex;align-items:center;gap:8px;font-size:11.5px;color:#555}',
	'.dsh-pet-panel-set .dsh-pet-panel-av .dsh-pet-ava{width:24px;height:24px}',
	'.dsh-pet-panel-set .dsh-pet-panel-av button{height:24px;padding:0 8px;border:1px solid rgba(0,0,0,.12);border-radius:7px;',
	'background:#f7f8fa;color:#444;font-size:11px;font-family:inherit;cursor:pointer}',
	'.dsh-pet-panel-set .dsh-pet-panel-av button:hover{background:#eef2ff;border-color:#b9cdfb}',
	'.dsh-pet-panel-set .dsh-pet-panel-av i{flex:1 1 auto}',
	'.dsh-pet-panel-set input[type=file]{display:none}',
	'.dsh-pet-row.is-me .dsh-pet-ava{background:#2b6cf0}',
	'.dsh-pet-row.is-bili .dsh-pet-ava{background:#fb7299}',
	'.dsh-pet-col{display:flex;flex-direction:column;min-width:0;max-width:78%}',
	'.dsh-pet-row.is-me .dsh-pet-col{align-items:flex-end}',
	'.dsh-pet-bubble{position:relative;padding:7px 10px;border-radius:12px;background:#fff;',
	'box-shadow:0 1px 3px rgba(0,0,0,.10);white-space:pre-wrap;overflow-wrap:anywhere;font-size:var(--panel-fs,12.5px);',
	'font-weight:var(--panel-fw,400)}',
	'.dsh-pet-row.is-me .dsh-pet-bubble{background:#2b6cf0;color:#fff}',
	'.dsh-pet-row.is-bili .dsh-pet-bubble{background:#fff5f8;border:1px solid rgba(251,114,153,.35)}',
	'.dsh-pet-bubble mark{background:#ffe58a;color:inherit;border-radius:3px;padding:0 1px}',
	'.dsh-pet-row.is-me .dsh-pet-bubble mark{background:#ffe58a;color:#1b3a70}',
	'.dsh-pet-meta{margin-top:3px;font-size:10px;color:rgba(43,43,43,.42)}',
	'.dsh-pet-panel-chip{display:inline-block;margin-right:4px;padding:0 5px;border-radius:5px;background:#fb7299;color:#fff;font-size:10px}',
	'.dsh-pet-panel-empty{color:rgba(43,43,43,.5);padding:16px 0;text-align:center}',
	'.dsh-pet-panel-err{color:#d94f3d}',
	'.dsh-pet-panel-set{display:none;flex-direction:column;gap:6px;padding:8px 12px;background:#fff;border-bottom:1px solid rgba(0,0,0,.06)}',
	'.dsh-pet-panel-set.is-on{display:flex}',
	'.dsh-pet-panel-set label{display:flex;align-items:center;gap:8px;font-size:11.5px;color:#555}',
	'.dsh-pet-panel-set span{flex:none;width:52px}',
	'.dsh-pet-panel-set input[type=range]{flex:1 1 auto;min-width:0;accent-color:#2b6cf0}',
	'.dsh-pet-panel-set b{flex:none;width:44px;text-align:right;font-size:11px;font-weight:600;color:#2b6cf0}',
	'.dsh-pet-panel-set select{flex:1 1 auto;min-width:0;height:26px;padding:0 6px;border:1px solid rgba(0,0,0,.12);',
	'border-radius:8px;background:#f7f8fa;color:#333;font-size:12px;outline:none;cursor:pointer}',
	'.dsh-pet-panel-set select:focus{border-color:#2b6cf0;background:#fff}',
	'.dsh-pet-panel-set .dsh-pet-panel-set-hint{font-size:10.5px;color:rgba(43,43,43,.45);line-height:1.4}',
	'.dsh-pet-panel-foot{display:none;flex:none;align-items:flex-end;gap:6px;padding:8px 12px;background:#fff;border-top:1px solid rgba(0,0,0,.06)}',
	'.dsh-pet-panel-foot.is-on{display:flex}',
	'.dsh-pet-panel-input{flex:1 1 auto;min-width:0;height:34px;max-height:88px;resize:none;padding:6px 8px;',
	'border:1px solid rgba(0,0,0,.12);border-radius:10px;font-family:inherit;font-size:12.5px;line-height:1.4;',
	'background:#f7f8fa;color:#333;outline:none}',
	'.dsh-pet-panel-input:focus{border-color:#2b6cf0;background:#fff}',
	'.dsh-pet-panel-send{flex:none;height:34px;padding:0 12px;border:none;border-radius:10px;background:#2b6cf0;',
	'color:#fff;font-family:inherit;font-size:12.5px;cursor:pointer}',
	'.dsh-pet-panel-send:disabled{opacity:.45;cursor:default}',
	'.dsh-pet-panel-typing{margin:0 0 10px 34px;color:rgba(43,43,43,.45);font-size:11.5px}',
	'.dsh-pet-row.is-me .dsh-pet-bubble.is-sending{opacity:.55}',
	'.dsh-pet-row.is-fav .dsh-pet-bubble{box-shadow:0 0 0 1.5px #f5b301}',
	'.dsh-pet-panel-revoked{text-align:center;color:rgba(43,43,43,.38);font-size:11px;margin:0 0 10px}',
	'.dsh-pet-panel-cal{position:absolute;z-index:3;display:none;flex-direction:column;gap:5px;padding:8px;border-radius:12px;',
	'background:#fff;border:1px solid rgba(0,0,0,.08);box-shadow:0 10px 26px rgba(0,0,0,.2);font-size:12px;width:196px}',
	'.dsh-pet-panel-cal.is-on{display:flex}',
	'.dsh-pet-panel-cal-head{display:flex;align-items:center;gap:4px}',
	'.dsh-pet-panel-cal-head b{flex:1 1 auto;text-align:center;font-size:12px;font-weight:600}',
	'.dsh-pet-panel-cal-head button{flex:none;width:20px;height:20px;border:none;border-radius:6px;background:rgba(0,0,0,.05);color:#555;font-size:12px;line-height:1;cursor:pointer}',
	'.dsh-pet-panel-cal-head button:hover{background:rgba(0,0,0,.12)}',
	'.dsh-pet-panel-cal-wk{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;color:rgba(43,43,43,.4);font-size:10.5px;text-align:center}',
	'.dsh-pet-panel-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}',
	'.dsh-pet-panel-cal-d{position:relative;height:22px;padding:0;border:none;border-radius:6px;background:transparent;color:#333;font-size:11.5px;font-family:inherit;cursor:pointer}',
	'.dsh-pet-panel-cal-d:hover{background:#eef2ff}',
	'.dsh-pet-panel-cal-d.is-off{color:rgba(0,0,0,.2);cursor:default}',
	'.dsh-pet-panel-cal-d.is-today{box-shadow:inset 0 0 0 1px #2b6cf0}',
	'.dsh-pet-panel-cal-d.is-on{background:#2b6cf0;color:#fff;box-shadow:none}',
	'.dsh-pet-panel-cal-d.has::after{content:"";position:absolute;left:50%;bottom:1px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:#fb7299}',
	'.dsh-pet-panel-cal-d.is-on.has::after{background:#fff}',
	'.dsh-pet-panel-cal-foot{display:flex;gap:6px}',
	'.dsh-pet-panel-cal-foot button{flex:1 1 0;height:22px;border:1px solid rgba(0,0,0,.12);border-radius:7px;background:#f7f8fa;color:#444;font-size:11px;font-family:inherit;cursor:pointer}',
	'.dsh-pet-panel-cal-foot button:hover{background:#eef2ff;border-color:#b9cdfb}',
	'.dsh-pet-panel-menu{position:fixed;z-index:2147483005;display:none;flex-direction:column;min-width:126px;padding:4px;border-radius:10px;',
	'background:#fff;border:1px solid rgba(0,0,0,.08);box-shadow:0 10px 26px rgba(0,0,0,.22);font-size:12px}',
	'.dsh-pet-panel-menu.is-on{display:flex}',
	'.dsh-pet-panel-mi{padding:6px 10px;border-radius:7px;color:#333;cursor:pointer;white-space:nowrap}',
	'.dsh-pet-panel-mi:hover{background:#eef2ff}',
	'.dsh-pet-panel-mi.is-danger:hover{background:#ffeceb;color:#d94f3d}',
	// 边缘拖拽改大小：8 个热区（贴边 9px），cursor 按方向给
	'.dsh-pet-rs{position:absolute;z-index:6;-webkit-app-region:no-drag}',
	'.dsh-pet-rs.n{top:-2px;left:10px;right:10px;height:10px;cursor:ns-resize}',
	'.dsh-pet-rs.s{bottom:-2px;left:10px;right:10px;height:10px;cursor:ns-resize}',
	'.dsh-pet-rs.w{left:-2px;top:10px;bottom:10px;width:10px;cursor:ew-resize}',
	'.dsh-pet-rs.e{right:-2px;top:10px;bottom:10px;width:10px;cursor:ew-resize}',
	'.dsh-pet-rs.nw{left:-2px;top:-2px;width:14px;height:14px;cursor:nwse-resize}',
	'.dsh-pet-rs.ne{right:-2px;top:-2px;width:14px;height:14px;cursor:nesw-resize}',
	'.dsh-pet-rs.sw{left:-2px;bottom:-2px;width:14px;height:14px;cursor:nesw-resize}',
	'.dsh-pet-rs.se{right:-2px;bottom:-2px;width:14px;height:14px;cursor:nwse-resize}',
	'.dsh-pet-panel-tab.is-add{background:rgba(43,108,240,.10);color:#2b6cf0;font-weight:700;padding:4px 8px}',
	'.dsh-pet-panel-tab.is-add:hover{background:rgba(43,108,240,.18)}',
	// 分支对话
	'.dsh-pet-branch-bar{display:none;align-items:center;gap:8px;flex:none;padding:6px 12px;background:#fff7e6;border-bottom:1px solid rgba(0,0,0,.06);font-size:11px;color:#8a5b00}',
	'.dsh-pet-branch-bar.is-on{display:flex}',
	'.dsh-pet-branch-bar b{font-weight:700}',
	'.dsh-pet-branch-bar .dsh-pet-branch-sp{flex:1 1 auto}',
	'.dsh-pet-branch-bar button{height:22px;padding:0 9px;border:1px solid rgba(0,0,0,.12);border-radius:7px;background:#fff;color:#8a5b00;font-size:11px;font-family:inherit;cursor:pointer}',
	'.dsh-pet-branch-bar button.is-primary{background:#2b6cf0;border-color:#2b6cf0;color:#fff}',
	'.dsh-pet-branch-name{flex:0 1 150px;min-width:80px;height:22px;padding:0 8px;border:1px solid rgba(138,91,0,.25);border-radius:7px;background:#fff;color:#5c3d00;font-size:11px;font-family:inherit;outline:none}',
	'.dsh-pet-branch-name:focus{border-color:#f0a020;box-shadow:0 0 0 2px rgba(240,160,32,.15)}',
	'.dsh-pet-panel-tab.is-branch{max-width:86px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:rgba(240,160,32,.12);color:#8a5b00}',
	'.dsh-pet-panel-tab.is-branch:hover{background:rgba(240,160,32,.2)}',
	'.dsh-pet-panel-tab.is-branch.is-on{background:#f0a020;color:#fff}',
	'.dsh-pet-panel-tab.is-rename{padding:0 3px;max-width:130px}',
	'.dsh-pet-tab-rename{width:104px;height:19px;padding:0 5px;border:none;border-radius:5px;background:#fff;color:#5c3d00;font-size:11px;font-family:inherit;outline:none}',
	'.dsh-pet-branch-bar button:disabled{opacity:.5;cursor:default}',
	// QQ 合并转发那种卡片
	'.dsh-pet-card{max-width:92%;padding:10px 12px;border:1px solid rgba(0,0,0,.08);border-radius:12px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.06);cursor:pointer}',
	'.dsh-pet-card:hover{border-color:#b9cdfb}',
	'.dsh-pet-card-h{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#2b2b2b}',
	'.dsh-pet-card-p{margin-top:6px;font-size:11px;line-height:1.55;color:#7a7a7a;white-space:pre-wrap;overflow:hidden;max-height:66px}',
	'.dsh-pet-card-f{margin-top:8px;font-size:11px;color:#2b6cf0}',
	'.dsh-pet-card-body{display:none;margin-top:8px;padding-top:8px;border-top:1px dashed rgba(0,0,0,.12)}',
	'.dsh-pet-card.is-open .dsh-pet-card-body{display:block}',
	'.dsh-pet-card.is-open .dsh-pet-card-p{max-height:none}',
	'.dsh-pet-card-body .dsh-pet-bubble{max-width:100%}'
].join('');
let panelCssInjected = false;
function injectPanelCss() {
	if (panelCssInjected || typeof document === 'undefined') return;
	panelCssInjected = true;
	const tag = document.createElement('style');
	tag.dataset.plugin = 'dsh-pet';
	tag.dataset.pluginCss = 'dsh-pet/panel';
	tag.textContent = PANEL_CSS;
	document.head.appendChild(tag);
}
/** 气泡可容纳的正文行数 → 需要的像素高度（上/下窗口余量按它算，见 sprite.js 的 margin） */
function bubbleFitLinesPx(font, size, lines) {
	const f = resolveFontPx(font, size).bubble;
	const m = BUBBLE_METRICS;
	return Math.ceil(m.padY * 2 * f + m.lineHeight * f * Math.max(1, Number(lines) || 1) + m.lineHeight * f * 0.9);
}
function fetchHistory(baseUrl, petId, rounds) {
	const u = baseUrl + '?pet=' + encodeURIComponent(petId) + '&rounds=' + String(rounds);
	return fetch(u, { cache: 'no-store' })
		.then((r) => r.json())
		.then((j) => (j && j.ok === true && Array.isArray(j.messages) ? j.messages : []))
		.catch(() => null);
}
function panelPad2(n) {
	return (n < 10 ? '0' : '') + n;
}
/** ts → 本地日期键 YYYY-MM-DD（用于按天分组与按日期筛选） */
function panelDayKey(ts) {
	const d = new Date(Number(ts) || Date.now());
	return d.getFullYear() + '-' + panelPad2(d.getMonth() + 1) + '-' + panelPad2(d.getDate());
}
function panelHHMM(ts) {
	const d = new Date(Number(ts) || Date.now());
	return panelPad2(d.getHours()) + ':' + panelPad2(d.getMinutes());
}
/** 日期分隔条上的文案：今天 / 昨天 / 10月25日 周六 */
function panelDayLabel(key) {
	const today = panelDayKey(Date.now());
	const y = new Date();
	y.setDate(y.getDate() - 1);
	const yKey = panelDayKey(y.getTime());
	if (key === today) return '今天';
	if (key === yKey) return '昨天';
	const parts = String(key).split('-');
	const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
	const wk = '日一二三四五六';
	return Number(parts[1]) + '月' + Number(parts[2]) + '日 周' + wk[d.getDay()];
}
/** 关键词高亮：把 text 里所有命中的片段包进 <mark>，其余保持纯文本节点 */
function panelHighlight(el, text, kw) {
	const needle = String(kw || '').toLowerCase();
	if (!needle) {
		el.textContent = text;
		return;
	}
	const hay = text.toLowerCase();
	let from = 0;
	let hit = hay.indexOf(needle, from);
	if (hit < 0) {
		el.textContent = text;
		return;
	}
	while (hit >= 0) {
		if (hit > from) el.appendChild(document.createTextNode(text.slice(from, hit)));
		const mk = document.createElement('mark');
		mk.textContent = text.slice(hit, hit + needle.length);
		el.appendChild(mk);
		from = hit + needle.length;
		hit = hay.indexOf(needle, from);
	}
	if (from < text.length) el.appendChild(document.createTextNode(text.slice(from)));
}
const PANEL_PREF_KEY = 'dsh-pet-panel-prefs';
/** 字体候选：都用系统自带字体打头，最后兜底 sans-serif（没装就自动落到下一个，不会方块） */
const PANEL_FONTS = [
	{ name: '默认（手写体）', css: '' },
	{ name: '微软雅黑', css: "'Microsoft YaHei','PingFang SC','Segoe UI',sans-serif" },
	{ name: '等线', css: "'DengXian','Microsoft YaHei',sans-serif" },
	{ name: '黑体', css: "SimHei,'Microsoft YaHei',sans-serif" },
	{ name: '宋体', css: "SimSun,'Songti SC',serif" },
	{ name: '楷体', css: "KaiTi,'Kaiti SC','STKaiti',serif" },
	{ name: '幼圆', css: "YouYuan,'Yuanti SC',sans-serif" },
	{ name: '霞鹜文楷（若已装）', css: "'LXGW WenKai','LXGW WenKai Screen',KaiTi,serif" },
	{ name: '等宽（Consolas）', css: "Consolas,'Cascadia Mono','Courier New',monospace" },
];
/** 面板偏好：字号 / 字重 / 宽 / 高 / 字体 / 位置 / 双方头像，存在 localStorage（不写盘、不动插件配置，坏了删掉即恢复默认） */
function panelPrefs() {
	const def = { fs: 12.5, fw: 400, w: 430, h: 520, font: '', px: null, py: null, avMe: '', avPet: '', dock: true };
	try {
		const j = JSON.parse(localStorage.getItem(PANEL_PREF_KEY) || 'null');
		if (!j || typeof j !== 'object') return def;
		const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
		const font = PANEL_FONTS.some((f) => f.css === j.font) ? String(j.font || '') : '';
		// 头像只认 64px 缩过的 dataURL，长度上限挡掉超大数据（localStorage 配额有限）
		const av = (v) => (typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(v) && v.length < 200000 ? v : '');
		return {
			fs: num(j.fs, 11, 20, def.fs),
			fw: num(j.fw, 300, 800, def.fw),
			w: num(j.w, 300, 900, def.w),
			h: num(j.h, 260, 1100, def.h),
			font,
			px: num(j.px, -10000, 10000, null),
			py: num(j.py, -10000, 10000, null),
			avMe: av(j.avMe),
			avPet: av(j.avPet),
			dock: j.dock !== false,
		};
	} catch (e) {
		return def;
	}
}
function savePanelPrefs(p) {
	try {
		localStorage.setItem(PANEL_PREF_KEY, JSON.stringify(p));
	} catch (e) {
		/* 隐私模式/配额满：当作没保存，不影响当前会话 */
	}
}
const PANEL_FAV_KEY = 'dsh-pet-panel-favs';
const PANEL_HIDE_KEY = 'dsh-pet-panel-hidden';
// 分支对话：合并后存这里，以 QQ「合并转发」卡片的形式插进对话记录
const PANEL_BRANCH_KEY = 'dsh-pet-panel-branches';
// 分支里聊过的内容（role|content），主记录渲染时按它过滤掉，免得分支污染主对话
const PANEL_BHIDE_KEY = 'dsh-pet-panel-branchhide';
/** 一条消息的稳定键：memory.json 里同一轮的 user/assistant 共用 ts，所以要带上 role */
function panelMsgKey(m) {
	return String(m && m.ts ? m.ts : 0) + '|' + String(m && m.role ? m.role : '');
}
function panelLoadArr(key) {
	try {
		const j = JSON.parse(localStorage.getItem(key) || 'null');
		return Array.isArray(j) ? j : [];
	} catch (e) {
		return [];
	}
}
function panelSaveArr(key, v) {
	try {
		localStorage.setItem(key, JSON.stringify(v));
	} catch (e) {
		/* 写不进去就算了，不打断面板 */
	}
}
/** 头像：有自定义图片就塞 <img>，否则退回单字（我 / 宠 / B） */
function fillAva(el, url, letter) {
	el.textContent = '';
	if (url) {
		const img = document.createElement('img');
		img.src = url;
		img.alt = '';
		img.draggable = false;
		el.appendChild(img);
	} else {
		el.textContent = letter;
	}
}
/** 头像：把选中的图片居中裁成正方形并缩到 64px，转成 dataURL（原图几百 KB 存不进 localStorage） */
function readToAvatar(file, cb) {
	const fr = new FileReader();
	fr.onload = () => {
		const img = new Image();
		img.onload = () => {
			try {
				const S = 64;
				const cv = document.createElement('canvas');
				cv.width = S;
				cv.height = S;
				const g = cv.getContext('2d');
				const side = Math.min(img.naturalWidth || 1, img.naturalHeight || 1);
				g.drawImage(
					img,
					((img.naturalWidth || side) - side) / 2,
					((img.naturalHeight || side) - side) / 2,
					side,
					side,
					0,
					0,
					S,
					S,
				);
				cb(cv.toDataURL('image/jpeg', 0.86));
			} catch (e) {
				cb('');
			}
		};
		img.onerror = () => cb('');
		img.src = String(fr.result || '');
	};
	fr.onerror = () => cb('');
	fr.readAsDataURL(file);
}
function mountPetPanel(opts) {
	injectPanelCss();
	const { petId, baseUrl, title, text, clamp, onClose } = opts;
	let c = clamp && Number.isFinite(clamp.x + clamp.y + clamp.w + clamp.h)
		? clamp
		: { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
	const prefs = panelPrefs();
	// pos：宿主算好的「宠物右边」位置（窗口坐标 CSS px）；maxW：右边还剩下多少可用宽度
	const dockPos = opts.pos && Number.isFinite(opts.pos.left) ? opts.pos : null;
	const maxW = Number.isFinite(opts.maxW) ? opts.maxW : c.w - 20;
	const W = Math.max(240, Math.min(prefs.w, maxW, c.w - 20));
	const H = Math.max(220, Math.min(prefs.h, c.h - 20));
	const root = document.createElement('div');
	root.className = PANEL_CLASS;
	root.style.width = W + 'px';
	root.style.height = H + 'px';
	root.style.setProperty('--panel-fs', prefs.fs + 'px');
	root.style.setProperty('--panel-fw', String(prefs.fw));
	if (prefs.font) root.style.setProperty('--dsh-pet-font-family', prefs.font);
	const keepIn = (v, lo, hi) => Math.min(Math.max(lo, v), Math.max(lo, hi));
	const docked = !!dockPos && prefs.dock !== false;
	root.style.left =
		keepIn(
			docked
				? dockPos.left
				: Number.isFinite(prefs.px)
					? prefs.px
					: dockPos
						? dockPos.left
						: c.x + c.w - W - 10,
			c.x + 6,
			c.x + c.w - W - 6,
		) + 'px';
	root.style.top =
		keepIn(
			docked && Number.isFinite(dockPos.top)
				? dockPos.top
				: Number.isFinite(prefs.py)
					? prefs.py
					: c.y + 10,
			c.y + 6,
			c.y + c.h - H - 6,
		) + 'px';
	const head = document.createElement('div');
	head.className = 'dsh-pet-panel-head';
	const ttl = document.createElement('span');
	ttl.className = 'dsh-pet-panel-title';
	ttl.textContent = title || '对话与总结';
	const btnX = document.createElement('button');
	btnX.className = 'dsh-pet-panel-close';
	btnX.type = 'button';
	btnX.textContent = '×';
	btnX.title = '关闭（Esc）';
	head.appendChild(ttl);
	head.appendChild(btnX);
	const tabs = document.createElement('div');
	tabs.className = 'dsh-pet-panel-tabs';
	const bar = document.createElement('div');
	bar.className = 'dsh-pet-panel-bar';
	const q = document.createElement('input');
	q.className = 'dsh-pet-panel-q';
	q.type = 'search';
	q.placeholder = '搜索对话关键词…';
	q.spellcheck = false;
	const btnDate = document.createElement('button');
	btnDate.className = 'dsh-pet-panel-btn';
	btnDate.type = 'button';
	btnDate.textContent = '📅 日期';
	btnDate.title = '按日期筛选';
	// 小日历（自己画的）：点「📅 日期」弹出，选中某天就只显示那天的对话
	const cal = document.createElement('div');
	cal.className = 'dsh-pet-panel-cal';
	const calHead = document.createElement('div');
	calHead.className = 'dsh-pet-panel-cal-head';
	const calPrev = document.createElement('button');
	calPrev.type = 'button';
	calPrev.textContent = '‹';
	calPrev.title = '上个月';
	const calTitle = document.createElement('b');
	const calNext = document.createElement('button');
	calNext.type = 'button';
	calNext.textContent = '›';
	calNext.title = '下个月';
	calHead.appendChild(calPrev);
	calHead.appendChild(calTitle);
	calHead.appendChild(calNext);
	const calWk = document.createElement('div');
	calWk.className = 'dsh-pet-panel-cal-wk';
	'日一二三四五六'.split('').forEach((s) => {
		const d = document.createElement('span');
		d.textContent = s;
		calWk.appendChild(d);
	});
	const calGrid = document.createElement('div');
	calGrid.className = 'dsh-pet-panel-cal-grid';
	const calFoot = document.createElement('div');
	calFoot.className = 'dsh-pet-panel-cal-foot';
	const calToday = document.createElement('button');
	calToday.type = 'button';
	calToday.textContent = '今天';
	const calAll = document.createElement('button');
	calAll.type = 'button';
	calAll.textContent = '全部日期';
	calFoot.appendChild(calToday);
	calFoot.appendChild(calAll);
	cal.appendChild(calHead);
	cal.appendChild(calWk);
	cal.appendChild(calGrid);
	cal.appendChild(calFoot);
	const btnClear = document.createElement('button');
	btnClear.className = 'dsh-pet-panel-btn';
	btnClear.type = 'button';
	btnClear.textContent = '清除';
	btnClear.title = '清除筛选';
	btnClear.style.display = 'none';
	const btnSet = document.createElement('button');
	btnSet.className = 'dsh-pet-panel-btn';
	btnSet.type = 'button';
	btnSet.textContent = '⚙ 设置';
	btnSet.title = '字号与窗口大小';
	bar.appendChild(q);
	bar.appendChild(btnDate);
	bar.appendChild(btnSet);
	bar.appendChild(btnClear);
	// 设置面板：字号 / 宽 / 高 三个滑杆，改动即时生效并记到 localStorage
	const setBox = document.createElement('div');
	setBox.className = 'dsh-pet-panel-set';
	const mkSlider = (label, min, max, step, val, unit, onInput) => {
		const row = document.createElement('label');
		const sp = document.createElement('span');
		sp.textContent = label;
		const rg = document.createElement('input');
		rg.type = 'range';
		rg.min = String(min);
		rg.max = String(max);
		rg.step = String(step);
		rg.value = String(val);
		const bv = document.createElement('b');
		bv.textContent = val + unit;
		rg.addEventListener('input', (e) => {
			e.stopPropagation();
			const v = Number(rg.value);
			bv.textContent = v + unit;
			onInput(v);
		});
		rg.addEventListener('keydown', (e) => e.stopPropagation());
		row.appendChild(sp);
		row.appendChild(rg);
		row.appendChild(bv);
		row.input = rg;
		row.val = bv;
		return row;
	};
	let slW = null;
	let slH = null;
	const live = { fs: prefs.fs, fw: prefs.fw, w: prefs.w, h: prefs.h, font: prefs.font, avMe: prefs.avMe, avPet: prefs.avPet, px: root.offsetLeft, py: root.offsetTop, dock: docked };
	const commit = () => savePanelPrefs({
		fs: live.fs, fw: live.fw, w: live.w, h: live.h, font: live.font,
		avMe: live.avMe, avPet: live.avPet, px: live.px, py: live.py, dock: live.dock,
	});
	// 字体选择：改 `--dsh-pet-font-family`，整块面板（含输入框）跟着变
	const fontRow = document.createElement('label');
	const fontLabel = document.createElement('span');
	fontLabel.textContent = '字体';
	const fontSel = document.createElement('select');
	PANEL_FONTS.forEach((f) => {
		const op = document.createElement('option');
		op.value = f.css;
		op.textContent = f.name;
		op.style.fontFamily = f.css || '';
		fontSel.appendChild(op);
	});
	fontSel.value = prefs.font;
	fontSel.addEventListener('mousedown', (e) => e.stopPropagation());
	fontSel.addEventListener('keydown', (e) => e.stopPropagation());
	fontSel.addEventListener('change', () => {
		live.font = fontSel.value;
		if (live.font) root.style.setProperty('--dsh-pet-font-family', live.font);
		else root.style.removeProperty('--dsh-pet-font-family');
		commit();
	});
	fontRow.appendChild(fontLabel);
	fontRow.appendChild(fontSel);
	setBox.appendChild(fontRow);
	setBox.appendChild(
		mkSlider('字号', 11, 20, 0.5, prefs.fs, 'px', (v) => {
			live.fs = v;
			root.style.setProperty('--panel-fs', v + 'px');
			commit();
		}),
	);
	setBox.appendChild(
		mkSlider('字重', 300, 800, 100, prefs.fw, '', (v) => {
			live.fw = v;
			root.style.setProperty('--panel-fw', String(v));
			commit();
		}),
	);
	// 头像：选图后缩到 64×64 存 dataURL（localStorage 放得下，也不用管原图在哪）
	const mkAvatarRow = (label, key) => {
		const row = document.createElement('label');
		const sp = document.createElement('span');
		sp.textContent = label;
		const wrap = document.createElement('div');
		wrap.className = 'dsh-pet-panel-av';
		const ava = document.createElement('div');
		ava.className = 'dsh-pet-ava';
		const file = document.createElement('input');
		file.type = 'file';
		file.accept = 'image/*';
		const bPick = document.createElement('button');
		bPick.type = 'button';
		bPick.textContent = '选图';
		const bClear = document.createElement('button');
		bClear.type = 'button';
		bClear.textContent = '清除';
		const paint = () => {
			fillAva(ava, live[key], key === 'avMe' ? '我' : '宠');
			bClear.style.display = live[key] ? '' : 'none';
		};
		bPick.addEventListener('click', (e) => {
			e.stopPropagation();
			file.click();
		});
		bClear.addEventListener('click', (e) => {
			e.stopPropagation();
			live[key] = '';
			paint();
			commit();
			renderChat('keep');
		});
		file.addEventListener('change', () => {
			const f = file.files && file.files[0];
			file.value = '';
			if (!f) return;
			readToAvatar(f, (url) => {
				if (!url) return;
				live[key] = url;
				paint();
				commit();
				renderChat('keep');
			});
		});
		[wrap, file].forEach((el) => el.addEventListener('mousedown', (e) => e.stopPropagation()));
		[wrap, file].forEach((el) => el.addEventListener('keydown', (e) => e.stopPropagation()));
		const spacer = document.createElement('i');
		wrap.appendChild(ava);
		wrap.appendChild(spacer);
		wrap.appendChild(bPick);
		wrap.appendChild(bClear);
		row.appendChild(sp);
		row.appendChild(wrap);
		paint();
		return row;
	};
	setBox.appendChild(mkAvatarRow('我的头像', 'avMe'));
	setBox.appendChild(mkAvatarRow('宠物头像', 'avPet'));
	const btnRedock = document.createElement('button');
	btnRedock.type = 'button';
	btnRedock.className = 'dsh-pet-panel-btn';
	btnRedock.textContent = '贴回宠物右侧';
	btnRedock.title = '把面板重新放到小女仆右边';
	btnRedock.style.marginLeft = '0';
	btnRedock.addEventListener('mousedown', (e) => e.stopPropagation());
	btnRedock.addEventListener('click', (e) => {
		e.stopPropagation();
		live.dock = true;
		if (dockPos) {
			root.style.left = keepIn(dockPos.left, c.x + 6, c.x + c.w - root.offsetWidth - 6) + 'px';
			root.style.top = keepIn(Number.isFinite(dockPos.top) ? dockPos.top : c.y + 10, c.y + 6, c.y + c.h - root.offsetHeight - 6) + 'px';
			live.px = root.offsetLeft;
			live.py = root.offsetTop;
		} else {
			applyPos();
		}
		commit();
	});
	setBox.appendChild(btnRedock);
	slW = mkSlider('宽度', 300, Math.max(300, Math.min(900, c.w - 20)), 10, W, 'px', (v) => {
		live.w = v;
		root.style.width = Math.min(v, c.w - 20) + 'px';
		applyPos();
		commit();
	});
	setBox.appendChild(slW);
	slH = mkSlider('高度', 260, Math.max(260, Math.min(1100, c.h - 20)), 20, H, 'px', (v) => {
		live.h = v;
		root.style.height = Math.min(v, c.h - 20) + 'px';
		applyPos();
		commit();
	});
	setBox.appendChild(slH);
	btnSet.addEventListener('click', (e) => {
		e.stopPropagation();
		setBox.classList.toggle('is-on');
		btnSet.classList.toggle('is-on', setBox.classList.contains('is-on'));
	});
	const body = document.createElement('div');
	body.className = 'dsh-pet-panel-body';
	// 输入区：面板里直接跟宠物说话（POST /chat，与气泡旁那个小输入框同一条链路）
	const foot = document.createElement('div');
	foot.className = 'dsh-pet-panel-foot';
	const input = document.createElement('textarea');
	input.className = 'dsh-pet-panel-input';
	input.rows = 1;
	input.placeholder = '和小女仆说点什么…（Enter 发送，Shift+Enter 换行）';
	input.spellcheck = false;
	const btnSend = document.createElement('button');
	btnSend.className = 'dsh-pet-panel-send';
	btnSend.type = 'button';
	btnSend.textContent = '发送';
	foot.appendChild(input);
	foot.appendChild(btnSend);
	// 分支对话的顶栏：只是提示 + 两个出口（合并 / 放弃）
	const branchBar = document.createElement('div');
	branchBar.className = 'dsh-pet-branch-bar';
	const branchTag = document.createElement('b');
	branchTag.textContent = '分支对话';
	const branchHint = document.createElement('span');
	branchHint.textContent = '与主记录隔离，合并后才进对话记录';
	const branchSp = document.createElement('span');
	branchSp.className = 'dsh-pet-branch-sp';
	// 分支命名：合并时记下来，主记录里的合并卡片和标签栏上的分支标签都用它
	const branchName = document.createElement('input');
	branchName.className = 'dsh-pet-branch-name';
	branchName.type = 'text';
	branchName.maxLength = 20;
	branchName.placeholder = '给这条分支起个名字（可空）';
	branchName.addEventListener('mousedown', (e) => e.stopPropagation());
	branchName.addEventListener('keydown', (e) => {
		e.stopPropagation();
		if (e.key === 'Enter') btnMerge.click();
	});
	const btnMerge = document.createElement('button');
	btnMerge.type = 'button';
	btnMerge.className = 'is-primary';
	btnMerge.textContent = '合并到主对话';
	const btnDrop = document.createElement('button');
	btnDrop.type = 'button';
	btnDrop.textContent = '放弃';
	branchBar.appendChild(branchTag);
	branchBar.appendChild(branchHint);
	branchBar.appendChild(branchName);
	branchBar.appendChild(branchSp);
	branchBar.appendChild(btnMerge);
	branchBar.appendChild(btnDrop);
	root.appendChild(head);
	root.appendChild(tabs);
	root.appendChild(bar);
	root.appendChild(cal);
	root.appendChild(setBox);
	root.appendChild(body);
	root.appendChild(foot);
	root.appendChild(branchBar);
	// 边缘拖拽改大小：8 个热区，拖动时同时更新 w/h 与 left/top（拉左边框时左边缘跟着动）
	let rs = null;
	const RS_DIRS = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
	const onRsMove = (e) => {
		if (!rs) return;
		const dx = e.clientX - rs.sx;
		const dy = e.clientY - rs.sy;
		let w = rs.w;
		let h = rs.h;
		let l = rs.l;
		let t = rs.t;
		if (rs.dir.indexOf('e') >= 0) w = rs.w + dx;
		if (rs.dir.indexOf('w') >= 0) {
			w = rs.w - dx;
			l = rs.l + dx;
		}
		if (rs.dir.indexOf('s') >= 0) h = rs.h + dy;
		if (rs.dir.indexOf('n') >= 0) {
			h = rs.h - dy;
			t = rs.t + dy;
		}
		w = Math.max(240, Math.min(w, (docked && maxW ? maxW : c.w - 12)));
		h = Math.max(220, Math.min(h, c.h - 12));
		l = Math.min(Math.max(c.x + 6, l), Math.max(c.x + 6, c.x + c.w - w - 6));
		t = Math.min(Math.max(c.y + 6, t), Math.max(c.y + 6, c.y + c.h - h - 6));
		// 停靠状态下只往右下长：左/上边缘钉在宠物右边，免得拖一下就盖住宠物
		if (docked && dockPos) {
			l = Math.min(Math.max(c.x + 6, dockPos.left), Math.max(c.x + 6, c.x + c.w - w - 6));
			if (Number.isFinite(dockPos.top)) t = Math.min(Math.max(c.y + 6, dockPos.top), Math.max(c.y + 6, c.y + c.h - h - 6));
		}
		root.style.width = w + 'px';
		root.style.height = h + 'px';
		root.style.left = l + 'px';
		root.style.top = t + 'px';
		live.w = w;
		live.h = h;
		live.px = l;
		live.py = t;
		syncSizeSliders();
	};
	const onRsEnd = () => {
		if (!rs) return;
		rs = null;
		document.removeEventListener('mousemove', onRsMove, true);
		document.removeEventListener('mouseup', onRsEnd, true);
		commit();
	};
	for (const dir of RS_DIRS) {
		const hd = document.createElement('div');
		hd.className = 'dsh-pet-rs ' + dir;
		hd.title = '拖动改大小';
		hd.addEventListener('mousedown', (e) => {
			if (e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			rs = { dir, sx: e.clientX, sy: e.clientY, w: root.offsetWidth, h: root.offsetHeight, l: root.offsetLeft, t: root.offsetTop };
			document.addEventListener('mousemove', onRsMove, true);
			document.addEventListener('mouseup', onRsEnd, true);
		});
		root.appendChild(hd);
	}
	const syncSizeSliders = () => {
		if (slW) {
			slW.input.value = String(Math.round(live.w));
			slW.val.textContent = Math.round(live.w) + 'px';
		}
		if (slH) {
			slH.input.value = String(Math.round(live.h));
			slH.val.textContent = Math.round(live.h) + 'px';
		}
	};
	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		document.removeEventListener('mousedown', onDocDown, true);
		document.removeEventListener('keydown', onDocKey, true);
		document.removeEventListener('mousedown', onMenuDown, true);
		window.removeEventListener('resize', applyPos);
		root.remove();
		if (menu.parentNode) menu.remove();
		if (onClose) onClose();
	};
	const onDocDown = (e) => {
		if (menu.contains(e.target)) return;
		if (!root.contains(e.target)) close();
	};
	const onMenuDown = (e) => {
		if (!menu.contains(e.target)) closeMenu();
	};
	const onDocKey = (e) => {
		if (e.key === 'Escape') close();
	};
	btnX.addEventListener('click', (e) => {
		e.stopPropagation();
		close();
	});
	/** 把 left/top 拉回可见区（窗口尺寸变化、拖出屏幕、缩放后都走这个） */
	const applyPos = () => {
		const w = root.offsetWidth;
		const h = root.offsetHeight;
		const nx = Math.min(Math.max(c.x + 6, root.offsetLeft), Math.max(c.x + 6, c.x + c.w - w - 6));
		const ny = Math.min(Math.max(c.y + 6, root.offsetTop), Math.max(c.y + 6, c.y + c.h - h - 6));
		root.style.left = nx + 'px';
		root.style.top = ny + 'px';
		live.px = nx;
		live.py = ny;
	};
	// 左键按住标题栏拖动面板（长按移动窗口位置），松手记住位置
	let drag = null;
	const onDragMove = (e) => {
		if (!drag) return;
		const w = root.offsetWidth;
		const h = root.offsetHeight;
		const nx = Math.min(Math.max(c.x + 6, drag.ox + e.clientX - drag.sx), Math.max(c.x + 6, c.x + c.w - w - 6));
		const ny = Math.min(Math.max(c.y + 6, drag.oy + e.clientY - drag.sy), Math.max(c.y + 6, c.y + c.h - h - 6));
		root.style.left = nx + 'px';
		root.style.top = ny + 'px';
		live.px = nx;
		live.py = ny;
		live.dock = false; // 手动挪走了：不再自动停靠（设置里「贴回宠物右侧」可恢复）
	};
	const onDragEnd = () => {
		if (!drag) return;
		drag = null;
		head.classList.remove('is-drag');
		document.removeEventListener('mousemove', onDragMove, true);
		document.removeEventListener('mouseup', onDragEnd, true);
		commit();
	};
	head.addEventListener('mousedown', (e) => {
		if (e.button !== 0) return;
		if (e.target && e.target.closest && e.target.closest('.dsh-pet-panel-close')) return;
		e.preventDefault();
		drag = { sx: e.clientX, sy: e.clientY, ox: root.offsetLeft, oy: root.offsetTop };
		head.classList.add('is-drag');
		document.addEventListener('mousemove', onDragMove, true);
		document.addEventListener('mouseup', onDragEnd, true);
	});
	let all = [];
	let branches = panelLoadArr(PANEL_BRANCH_KEY);
	let bhide = new Set(panelLoadArr(PANEL_BHIDE_KEY).map(String));
	let curBranch = null;
	let kw = '';
	let day = '';
	let selectTab = null;
	/** 过滤：关键词命中（不区分大小写）+ 日期键相同；两者可叠加 */
	const filtered = () => {
		const needle = kw.trim().toLowerCase();
		return all.filter((m) => {
			if (day && panelDayKey(m.ts) !== day) return false;
			if (needle && String(m.content).toLowerCase().indexOf(needle) < 0) return false;
			return true;
		});
	};
	const syncBar = () => {
		btnClear.style.display = kw || day ? '' : 'none';
		btnDate.classList.toggle('is-on', !!day);
		btnDate.textContent = day ? '📅 ' + day.slice(5) : '📅 日期';
	};
	let favs = panelLoadArr(PANEL_FAV_KEY);
	let hidden = new Set(panelLoadArr(PANEL_HIDE_KEY).map(String));
	const isFavMsg = (m) => favs.some((f) => panelMsgKey(f) === panelMsgKey(m));
	const toggleFav = (m) => {
		const key = panelMsgKey(m);
		if (isFavMsg(m)) favs = favs.filter((f) => panelMsgKey(f) !== key);
		else favs = favs.concat([{ role: m.role, content: m.content, ts: m.ts, at: Date.now() }]);
		panelSaveArr(PANEL_FAV_KEY, favs);
	};
	const revokeMsg = (m) => {
		hidden.add(panelMsgKey(m));
		panelSaveArr(PANEL_HIDE_KEY, Array.from(hidden));
	};
	/** 右键菜单：浮在鼠标处的轻量菜单（收藏 / 撤回 / 对选中内容提问） */
	const menu = document.createElement('div');
	menu.className = 'dsh-pet-panel-menu';
	const closeMenu = () => {
		menu.classList.remove('is-on');
		menu.innerHTML = '';
	};
	const openMenu = (x, y, items) => {
		menu.innerHTML = '';
		for (const it of items) {
			if (!it) continue;
			const d = document.createElement('div');
			d.className = 'dsh-pet-panel-mi' + (it.danger ? ' is-danger' : '');
			d.textContent = it.label;
			d.addEventListener('mousedown', (e) => {
				e.stopPropagation();
				e.preventDefault();
				closeMenu();
				it.run();
			});
			menu.appendChild(d);
		}
		menu.classList.add('is-on');
		const mw = menu.offsetWidth || 140;
		const mh = menu.offsetHeight || 80;
		menu.style.left = Math.min(x, window.innerWidth - mw - 6) + 'px';
		menu.style.top = Math.min(y, window.innerHeight - mh - 6) + 'px';
	};
	const pickedText = () => {
		const s = window.getSelection();
		if (!s || s.isCollapsed) return '';
		const t = String(s.toString()).replace(/\s+/g, ' ').trim();
		return t.length > 400 ? t.slice(0, 400) : t;
	};
	/** 把选中的话塞进输入框当引用，用户接着问「这句什么意思」 */
	const askAbout = (t) => {
		if (selectTab) selectTab('hist');
		foot.classList.add('is-on');
		const quote = '「' + t + '」\n';
		input.value = input.value ? input.value.replace(/\s*$/, '\n') + quote : quote;
		input.focus();
		input.selectionStart = input.selectionEnd = input.value.length;
	};
	// 没落在某条消息上、但选中了文字时，右键也给「对选中内容提问」
	body.addEventListener('contextmenu', (e) => {
		if (e.target && e.target.closest && e.target.closest('.dsh-pet-row')) return;
		const sel = pickedText();
		if (!sel) return;
		e.preventDefault();
		openMenu(e.clientX, e.clientY, [{ label: '❓ 对选中内容提问', run: () => askAbout(sel) }]);
	});
	const makeRow = (m, favTab) => {
		const isBili = String(m.content).startsWith('【B站看完】');
		const isMe = m.role === 'user' && !isBili;
		const row = document.createElement('div');
		row.className =
			'dsh-pet-row' + (isMe ? ' is-me' : '') + (isBili ? ' is-bili' : '') + (!favTab && isFavMsg(m) ? ' is-fav' : '');
		const ava = document.createElement('div');
		ava.className = 'dsh-pet-ava';
		ava.textContent = isMe ? '我' : isBili ? 'B' : '宠';
		fillAva(ava, isMe ? live.avMe : isBili ? '' : live.avPet, ava.textContent);
		const col = document.createElement('div');
		col.className = 'dsh-pet-col';
		const bl = document.createElement('div');
		bl.className = 'dsh-pet-bubble';
		if (isBili) {
			const chip = document.createElement('span');
			chip.className = 'dsh-pet-panel-chip';
			chip.textContent = 'B站总结';
			bl.appendChild(chip);
		}
		const txt = document.createElement('span');
		panelHighlight(txt, String(m.content), kw);
		bl.appendChild(txt);
		const meta = document.createElement('div');
		meta.className = 'dsh-pet-meta';
		meta.textContent = panelHHMM(m.ts) + (isBili ? ' · 自动生成' : '');
		col.appendChild(bl);
		col.appendChild(meta);
		row.appendChild(ava);
		row.appendChild(col);
		row.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const sel = pickedText();
			if (favTab) {
				openMenu(e.clientX, e.clientY, [
					{ label: '★ 取消收藏', danger: true, run: () => { toggleFav(m); loadFavs(); } },
					sel ? { label: '❓ 对选中内容提问', run: () => askAbout(sel) } : null,
				]);
				return;
			}
			openMenu(e.clientX, e.clientY, [
				sel ? { label: '❓ 对选中内容提问', run: () => askAbout(sel) } : null,
				{ label: isFavMsg(m) ? '★ 取消收藏' : '⭐ 收藏这条', run: () => { toggleFav(m); renderChat('keep'); } },
				{ label: '↩ 撤回这条', danger: true, run: () => { revokeMsg(m); renderChat('keep'); } },
			]);
		});
		return row;
	};
	// 分支记录以「合并转发」卡片的形式出现在主对话里（QQ 那种：标题 + 3 行预览 + 查看 N 条）
	const saveBranches = () => panelSaveArr(PANEL_BRANCH_KEY, branches);
	const saveBHide = () => panelSaveArr(PANEL_BHIDE_KEY, Array.from(bhide));
	const branchKeyOf = (m) => String(m.role || '') + '|' + String(m.content || '').trim();
	const makeBranchCard = (b) => {
		const row = document.createElement('div');
		row.className = 'dsh-pet-row is-branch';
		const ava = document.createElement('div');
		ava.className = 'dsh-pet-ava';
		fillAva(ava, live.avPet, '宠');
		const col = document.createElement('div');
		col.className = 'dsh-pet-col';
		const card = document.createElement('div');
		card.className = 'dsh-pet-card';
		const h = document.createElement('div');
		h.className = 'dsh-pet-card-h';
		h.textContent = '💬 ' + (b.name ? b.name : '小女仆的聊天记录');
		const p = document.createElement('div');
		p.className = 'dsh-pet-card-p';
		p.textContent = b.msgs
			.slice(0, 3)
			.map((m) => (m.role === 'user' ? '我：' : '小女仆：') + String(m.content).replace(/\s+/g, ' ').slice(0, 40))
			.join('\n');
		const f = document.createElement('div');
		f.className = 'dsh-pet-card-f';
		f.textContent = '查看 ' + b.msgs.length + ' 条聊天记录 ›';
		const inner = document.createElement('div');
		inner.className = 'dsh-pet-card-body';
		for (const m of b.msgs) {
			const mr = makeRow({ role: m.role, content: m.content, ts: m.ts }, false);
			mr.classList.add('is-in-card');
			inner.appendChild(mr);
		}
		card.appendChild(h);
		card.appendChild(p);
		card.appendChild(f);
		card.appendChild(inner);
		card.addEventListener('click', (e) => {
			e.stopPropagation();
			card.classList.toggle('is-open');
			f.textContent = (card.classList.contains('is-open') ? '收起 ›' : '查看 ' + b.msgs.length + ' 条聊天记录 ›');
		});
		card.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			e.stopPropagation();
			openMenu(e.clientX, e.clientY, [
				{ label: '✏ 重命名分支', run: () => renameBranch(b.id) },
				{ label: '🗑 删除分支（对话保留在记录里）', danger: true, run: () => removeBranch(b.id) },
			]);
		});
		col.appendChild(card);
		const meta = document.createElement('div');
		meta.className = 'dsh-pet-meta';
		meta.textContent = panelHHMM(b.at);
		col.appendChild(meta);
		row.appendChild(ava);
		row.appendChild(col);
		return row;
	};
	/** 分支视图：清空 body，只显示这条分支里的消息；看已合并的分支时只读（没有合并/放弃按钮，也不能继续聊） */
	const renderBranch = () => {
		body.innerHTML = '';
		const readOnly = !!(curBranch && curBranch.readOnly);
		branchBar.classList.toggle('is-on', !readOnly);
		const tip = document.createElement('div');
		tip.className = 'dsh-pet-panel-count';
		const label = curBranch && curBranch.name ? '「' + curBranch.name + '」' : '分支对话';
		tip.textContent = readOnly
			? label + ' · 共 ' + (curBranch ? curBranch.msgs.length : 0) + ' 条（已合并进对话记录，只读）'
			: curBranch && curBranch.msgs.length
				? label + ' · 共 ' + curBranch.msgs.length + ' 条'
				: label + ' · 随便问，聊完点「合并到主对话」才会进记录';
		body.appendChild(tip);
		if (curBranch) for (const m of curBranch.msgs) body.appendChild(makeRow(m, false));
		body.scrollTop = body.scrollHeight;
	};
	const startBranch = () => {
		curBranch = { id: 'b' + Date.now(), at: Date.now(), msgs: [] };
		branchName.value = '';
		selectTab('branch');
		renderBranch();
		input.focus();
	};
	/** 打开一条已合并分支的内容（点标签栏上的分支名，或点合并卡片） */
	const openBranch = (id) => {
		const b = branches.find((x) => x.id === id);
		if (!b) return;
		curBranch = { id: b.id, at: b.at, name: b.name || '', msgs: b.msgs.slice(), readOnly: true };
		selectTab('branch-' + id);
		renderBranch();
	};
	const dropBranch = () => {
		// 放弃：把这次聊过的话从 bhide 里撤掉（它们本来就没进主记录，直接清掉状态即可）
		curBranch = null;
		branchBar.classList.remove('is-on');
		selectTab('hist');
		loadHistory();
	};
	const mergeBranch = () => {
		if (!curBranch || !curBranch.msgs.length) {
			branchBar.classList.remove('is-on');
			selectTab('hist');
			loadHistory();
			return;
		}
		const nm = String(branchName.value || '').trim().slice(0, 20);
		const b = { id: curBranch.id, at: curBranch.at, name: nm, msgs: curBranch.msgs.slice() };
		branches = branches.concat([b]).sort((x, y) => x.at - y.at);
		saveBranches();
		for (const m of b.msgs) bhide.add(branchKeyOf(m));
		saveBHide();
		curBranch = null;
		branchName.value = '';
		branchBar.classList.remove('is-on');
		selectTab('hist');
		loadHistory();
		syncBranchTabs();
	};
	btnMerge.addEventListener('click', (e) => {
		e.stopPropagation();
		mergeBranch();
	});
	btnDrop.addEventListener('click', (e) => {
		e.stopPropagation();
		dropBranch();
	});
	// arg: true=滚到底 / false=回到顶 / 'keep'=保持当前位置（收藏、撤回这类原地刷新用它，免得跳回最早的对话）
	const renderChat = (arg) => {
		const keepScroll = arg === 'keep';
		const prevTop = body.scrollTop;
		const msgs = filtered();
		body.innerHTML = '';
		syncBar();
		if (!msgs.length) {
			const e = document.createElement('div');
			e.className = 'dsh-pet-panel-empty';
			e.textContent = all.length ? '没有匹配的对话' : '还没有对话记录';
			body.appendChild(e);
			return;
		}
		const cnt = document.createElement('div');
		cnt.className = 'dsh-pet-panel-count';
		cnt.textContent =
			kw || day ? '筛出 ' + msgs.length + ' 条 / 共 ' + all.length + ' 条' : '共 ' + msgs.length + ' 条';
		body.appendChild(cnt);
		// 主对话 + 分支卡片按时间合并成一条时间线
		const items = [];
		for (const m of msgs) items.push({ t: Number(m.ts) || 0, kind: 'msg', m });
		const needle2 = kw.trim().toLowerCase();
		for (const b of branches) {
			if (day && panelDayKey(b.at) !== day) continue;
			if (needle2 && b.msgs.map((x) => String(x.content)).join(' ').toLowerCase().indexOf(needle2) < 0) continue;
			items.push({ t: Number(b.at) || 0, kind: 'branch', b });
		}
		items.sort((x, y) => x.t - y.t);
		let lastDay = '';
		for (const it of items) {
			const k = panelDayKey(it.t);
			if (k !== lastDay) {
				lastDay = k;
				const dd = document.createElement('div');
				dd.className = 'dsh-pet-panel-day';
				const sp = document.createElement('span');
				sp.textContent = panelDayLabel(k);
				dd.appendChild(sp);
				body.appendChild(dd);
			}
			if (it.kind === 'branch') {
				body.appendChild(makeBranchCard(it.b));
				continue;
			}
			const m = it.m;
			if (hidden.has(panelMsgKey(m))) {
				const rv = document.createElement('div');
				rv.className = 'dsh-pet-panel-revoked';
				rv.textContent = '—— 你撤回了一条消息 ——';
				body.appendChild(rv);
				continue;
			}
			body.appendChild(makeRow(m, false));
		}
		body.scrollTop = keepScroll ? prevTop : arg ? body.scrollHeight : 0;
	};
	/** 收藏 tab：按收藏时间倒序，右键可取消收藏 */
	const loadFavs = () => {
		body.innerHTML = '';
		syncBar();
		const list = favs.slice().sort((a, b) => (b.at || 0) - (a.at || 0));
		if (!list.length) {
			const e = document.createElement('div');
			e.className = 'dsh-pet-panel-empty';
			e.textContent = '还没有收藏。在「对话记录」里右键某条消息 → ⭐ 收藏这条';
			body.appendChild(e);
			return;
		}
		const cnt = document.createElement('div');
		cnt.className = 'dsh-pet-panel-count';
		cnt.textContent = '共 ' + list.length + ' 条收藏';
		body.appendChild(cnt);
		for (const m of list) body.appendChild(makeRow(m, true));
		body.scrollTop = 0;
	};
	const renderText = (label, full) => {
		body.innerHTML = '';
		const row = document.createElement('div');
		row.className = 'dsh-pet-row';
		const ava = document.createElement('div');
		ava.className = 'dsh-pet-ava';
		fillAva(ava, live.avPet, '宠');
		const col = document.createElement('div');
		col.className = 'dsh-pet-col';
		col.style.maxWidth = '92%';
		const bl = document.createElement('div');
		bl.className = 'dsh-pet-bubble';
		bl.textContent = full;
		const meta = document.createElement('div');
		meta.className = 'dsh-pet-meta';
		meta.textContent = label;
		col.appendChild(bl);
		col.appendChild(meta);
		row.appendChild(ava);
		row.appendChild(col);
		body.appendChild(row);
	};
	const loadHistory = () => {
		body.innerHTML = '<div class="dsh-pet-panel-empty">读取中…</div>';
		fetchHistory(baseUrl, petId, 200).then((msgs) => {
			if (closed) return;
			if (!msgs) {
				body.innerHTML = '';
				const e = document.createElement('div');
				e.className = 'dsh-pet-panel-empty dsh-pet-panel-err';
				e.textContent = '读不到记忆（/chat 未响应）';
				body.appendChild(e);
				return;
			}
			const cleaned = [];
			let lastUser = '';
			for (const m of msgs) {
				const content = String(m && m.content ? m.content : '').trim();
				if (!content) continue;
				if (m.role === 'user' && content === lastUser) continue; // 同一句重复写了两遍：只留一条
				if (m.role === 'user') lastUser = content;
				// 分支里聊过的内容不进主记录（合并的是分支卡片本身）
				if (bhide.has(String(m.role || '') + '|' + content)) continue;
				cleaned.push({ role: m.role, content, ts: Number(m.ts) || 0 });
			}
			all = cleaned;
			renderChat(true);
		});
	};
	let debounce = null;
	let sending = false;
	/** 面板里直接发消息：先把自己的话贴上去，再等宠物回一条（与气泡输入框同一条 /chat 链路） */
	const sendText = () => {
		const t = input.value.trim();
		if (!t || sending) return;
		const inBranch = !!curBranch;
		// 分支里发的话只落进分支，同时记进 bhide，保证主记录里永远看不到
		const push = (role, content) => {
			const m = { role, content, ts: Date.now() };
			if (inBranch && curBranch) {
				curBranch.msgs.push(m);
				bhide.add(branchKeyOf(m));
				saveBHide();
				renderBranch();
			} else {
				all = all.concat([m]);
				renderChat(true);
			}
		};
		if (t.length > 2000) {
			// 宿主也是 2000 字上限，先在本地说清楚，别白等一轮
			push('assistant', '（太长了，最多 2000 字）');
			return;
		}
		sending = true;
		btnSend.disabled = true;
		input.value = '';
		input.style.height = '34px';
		push('user', t);
		const tip = document.createElement('div');
		tip.className = 'dsh-pet-panel-typing';
		tip.textContent = '小女仆正在打字…';
		body.appendChild(tip);
		body.scrollTop = body.scrollHeight;
		const done = () => {
			sending = false;
			btnSend.disabled = false;
		};
		fetch(baseUrl + '?surface=desktop&pet=' + encodeURIComponent(petId), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ text: t }),
		})
			.then((r) => r.json())
			.then((j) => {
				if (closed) return;
				if (j && j.ok === true && typeof j.text === 'string' && j.text) push('assistant', String(j.text));
				else {
					const msg = j && j.message ? String(j.message) : '没有收到回复';
					push('assistant', '（发送失败：' + msg + '）');
				}
			})
			.catch(() => {
				if (closed) return;
				push('assistant', '（发送失败：连不上宿主）');
			})
			.then(done, done);
	};
	btnSend.addEventListener('click', (e) => {
		e.stopPropagation();
		sendText();
	});
	input.addEventListener('keydown', (e) => {
		e.stopPropagation();
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			sendText();
		}
	});
	input.addEventListener('input', () => {
		input.style.height = '34px';
		input.style.height = Math.min(88, input.scrollHeight + 2) + 'px';
	});
	q.addEventListener('input', (e) => {
		e.stopPropagation();
		kw = q.value;
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(() => {
			renderChat(false);
		}, 120);
	});
	q.addEventListener('keydown', (e) => e.stopPropagation());
	let calY = new Date().getFullYear();
	let calM = new Date().getMonth();
	const calOpen = () => {
		const br = btnDate.getBoundingClientRect();
		const rr = root.getBoundingClientRect();
		cal.style.left = Math.max(6, Math.min(br.left - rr.left, rr.width - 208)) + 'px';
		cal.style.top = br.bottom - rr.top + 4 + 'px';
		cal.classList.add('is-on');
		btnDate.classList.add('is-on');
		renderCal();
	};
	const calClose = () => {
		cal.classList.remove('is-on');
		btnDate.classList.toggle('is-on', !!day);
	};
	/** 画这个月的格子：粉点=那天有对话，蓝框=今天，蓝底=当前选中的日期 */
	function renderCal() {
		calTitle.textContent = calY + '年' + (calM + 1) + '月';
		calGrid.innerHTML = '';
		const firstDow = new Date(calY, calM, 1).getDay();
		const total = new Date(calY, calM + 1, 0).getDate();
		const prevTotal = new Date(calY, calM, 0).getDate();
		const todayKey = panelDayKey(Date.now());
		const have = new Set(all.map((m) => panelDayKey(m.ts)));
		for (let i = 0; i < 42; i++) {
			const idx = i - firstDow + 1;
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'dsh-pet-panel-cal-d';
			let num = 0;
			let key = '';
			if (idx < 1) {
				num = prevTotal + idx;
				key = panelDayKey(new Date(calY, calM - 1, num).getTime());
				b.classList.add('is-off');
			} else if (idx > total) {
				num = idx - total;
				key = panelDayKey(new Date(calY, calM + 1, num).getTime());
				b.classList.add('is-off');
			} else {
				num = idx;
				key = panelDayKey(new Date(calY, calM, num).getTime());
			}
			b.textContent = String(num);
			if (key === todayKey) b.classList.add('is-today');
			if (have.has(key)) b.classList.add('has');
			if (day === key) b.classList.add('is-on');
			if (!b.classList.contains('is-off')) {
				b.addEventListener('click', (e) => {
					e.stopPropagation();
					day = key;
					renderChat(false);
					calClose();
				});
			}
			calGrid.appendChild(b);
		}
	}
	calPrev.addEventListener('click', (e) => {
		e.stopPropagation();
		calM--;
		if (calM < 0) {
			calM = 11;
			calY--;
		}
		renderCal();
	});
	calNext.addEventListener('click', (e) => {
		e.stopPropagation();
		calM++;
		if (calM > 11) {
			calM = 0;
			calY++;
		}
		renderCal();
	});
	calToday.addEventListener('click', (e) => {
		e.stopPropagation();
		day = panelDayKey(Date.now());
		renderChat(false);
		calClose();
	});
	calAll.addEventListener('click', (e) => {
		e.stopPropagation();
		day = '';
		renderChat(false);
		calClose();
	});
	btnDate.addEventListener('click', (e) => {
		e.stopPropagation();
		if (cal.classList.contains('is-on')) {
			calClose();
			return;
		}
		const base = day ? new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, 1) : new Date();
		calY = base.getFullYear();
		calM = base.getMonth();
		calOpen();
	});
	btnClear.addEventListener('click', (e) => {
		e.stopPropagation();
		kw = '';
		day = '';
		q.value = '';
		calClose();
		renderChat(false);
	});
	const tabsDef = [];
	if (text) tabsDef.push({ id: 'text', label: '本条全文', run: () => renderText(title || '本条', text) });
	tabsDef.push({ id: 'hist', label: '对话记录', run: loadHistory });
	tabsDef.push({ id: 'fav', label: '⭐ 收藏', run: loadFavs });
	const tabBtns = new Map();
	let activeTabId = '';
	selectTab = (id) => {
		activeTabId = String(id);
		for (const [tid, el] of tabBtns) el.classList.toggle('is-on', tid === id);
		const isHist = id === 'hist';
		const isBranchEdit = id === 'branch';
		const isBranchView = String(id).indexOf('branch-') === 0;
		const isBranch = isBranchEdit || isBranchView;
		bar.style.display = isHist ? '' : 'none';
		// 只看已合并的分支时不显示输入框（只读），编辑中的分支才给输入框
		foot.classList.toggle('is-on', isHist || isBranchEdit);
		if (!isBranch) branchBar.classList.remove('is-on');
		if (!isHist) {
			setBox.classList.remove('is-on');
			btnSet.classList.remove('is-on');
			calClose();
		}
	};
	for (const t of tabsDef) {
		const b = document.createElement('button');
		b.className = 'dsh-pet-panel-tab';
		b.type = 'button';
		b.textContent = t.label;
		b.addEventListener('click', (e) => {
			e.stopPropagation();
			selectTab(t.id);
			t.run();
		});
		tabBtns.set(t.id, b);
		tabs.appendChild(b);
	}
	// 收藏旁边的「＋」：开一条分支对话，聊完以合并转发卡片进对话记录
	const btnAdd = document.createElement('button');
	btnAdd.className = 'dsh-pet-panel-tab is-add';
	btnAdd.type = 'button';
	btnAdd.textContent = '＋ 分支';
	btnAdd.title = '开一条分支对话（单独聊，不混进主记录；聊完点「合并到主对话」）';
	btnAdd.addEventListener('click', (e) => {
		e.stopPropagation();
		startBranch();
	});
	tabs.appendChild(btnAdd);
	// 已合并的分支在标签栏上各占一格（名字），点一下直接看那条分支的内容，右键可重命名 / 删除
	const branchById = (id) => branches.find((x) => x.id === id) || null;
	/** 就地改名：把标签文字换成一个小输入框，Enter / 失焦保存，Esc 放弃 */
	const renameBranch = (id) => {
		const b = branchById(id);
		const btn = tabBtns.get('branch-' + id);
		if (!b || !btn) return;
		if (btn.querySelector('.dsh-pet-tab-rename')) return;
		const oldText = btn.textContent;
		btn.classList.add('is-rename');
		btn.textContent = '';
		const inp = document.createElement('input');
		inp.className = 'dsh-pet-tab-rename';
		inp.value = b.name || '';
		inp.placeholder = '分支名';
		inp.spellcheck = false;
		inp.maxLength = 24;
		btn.appendChild(inp);
		let done = false;
		const finish = (ok) => {
			if (done) return;
			done = true;
			if (ok) {
				b.name = inp.value.trim().slice(0, 24);
				saveBranches();
			}
			btn.classList.remove('is-rename');
			btn.textContent = b.name ? b.name : oldText;
			syncBranchTabs();
			// 卡片标题 / 只读视图标题也跟着变
			if (curBranch && curBranch.readOnly && curBranch.id === id) renderBranch();
			else if (activeTabId === 'hist' && body.querySelector('.dsh-pet-card')) renderChat('keep');
		};
		inp.addEventListener('mousedown', (e) => e.stopPropagation());
		inp.addEventListener('click', (e) => e.stopPropagation());
		inp.addEventListener('keydown', (e) => {
			e.stopPropagation();
			if (e.key === 'Enter') {
				e.preventDefault();
				finish(true);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				finish(false);
			}
		});
		inp.addEventListener('blur', () => finish(true));
		inp.focus();
		inp.select();
	};
	/** 删掉一条已合并的分支：卡片消失，但当初被它藏起来的那几句放回主记录（不丢内容） */
	const removeBranch = (id) => {
		const b = branchById(id);
		if (!b) return;
		branches = branches.filter((x) => x.id !== id);
		saveBranches();
		for (const m of b.msgs) bhide.delete(branchKeyOf(m));
		saveBHide();
		const btn = tabBtns.get('branch-' + id);
		if (btn) {
			tabBtns.delete('branch-' + id);
			btn.remove();
		}
		const wasOpen = !!(curBranch && curBranch.readOnly && curBranch.id === id);
		if (wasOpen) curBranch = null;
		syncBranchTabs();
		selectTab('hist');
		loadHistory();
	};
	const syncBranchTabs = () => {
		for (const el of [...tabs.querySelectorAll('.dsh-pet-panel-tab.is-branch')]) {
			const tid = el.dataset.bid;
			if (!branches.some((x) => x.id === tid)) {
				tabBtns.delete('branch-' + tid);
				el.remove();
			}
		}
		for (const b of branches) {
			const id = 'branch-' + b.id;
			let btn = tabBtns.get(id);
			if (!btn) {
				btn = document.createElement('button');
				btn.className = 'dsh-pet-panel-tab is-branch';
				btn.type = 'button';
				btn.dataset.bid = b.id;
				btn.addEventListener('click', (e) => {
					e.stopPropagation();
					openBranch(b.id);
				});
				btn.addEventListener('contextmenu', (e) => {
					e.preventDefault();
					e.stopPropagation();
					openMenu(e.clientX, e.clientY, [
						{ label: '✏ 重命名分支', run: () => renameBranch(b.id) },
						{ label: '🗑 删除分支（对话保留在记录里）', danger: true, run: () => removeBranch(b.id) },
					]);
				});
				tabs.insertBefore(btn, btnAdd);
				tabBtns.set(id, btn);
			}
			btn.textContent = b.name ? b.name : '分支 ' + panelHHMM(b.at);
			btn.title = '分支「' + (b.name || panelHHMM(b.at)) + '」· 共 ' + b.msgs.length + ' 条 · 点击查看内容';
		}
	};
	syncBranchTabs();
	const active = tabsDef.find((t) => t.id === opts.initialTab) || tabsDef[0];
	selectTab(active.id);
	document.body.appendChild(root);
	document.body.appendChild(menu);
	applyPos();
	window.addEventListener('resize', applyPos);
	document.addEventListener('mousedown', onDocDown, true);
	document.addEventListener('keydown', onDocKey, true);
	document.addEventListener('mousedown', onMenuDown, true);
	active.run();
	// rect：面板在窗口内的实际占位（sprite 用它把宠物让到面板外侧）
	const rect = () => {
		const r = root.getBoundingClientRect();
		return { left: r.left, top: r.top, width: r.width, height: r.height };
	};
	// reframe：窗口被拖动/改大小后，可见区变了 —— 用新的 clamp 重新摆位，保证面板不跑到屏幕外
	const reframe = (next) => {
		if (!next || !Number.isFinite(next.x + next.y + next.w + next.h)) return;
		c = next;
		const wMax = Math.max(240, Math.min(live.w, c.w - 20));
		const hMax = Math.max(220, Math.min(live.h, c.h - 20));
		if (root.offsetWidth > wMax) root.style.width = wMax + 'px';
		if (root.offsetHeight > hMax) root.style.height = hMax + 'px';
		applyPos();
	};
	return { el: root, close, rerender: loadHistory, rect, reframe };
}
exports.mountPetPanel = mountPetPanel;
exports.bubbleFitLinesPx = bubbleFitLinesPx;

//#endregion

//#region src/shared/physics.ts
const SPRING_K = 200;
const SPRING_C = 30;
const TRAIL_KEEP_MS = 200;
const RELEASE_WINDOW_MS = 150;
const RELEASE_STALE_MS = 150;
const MIN_SPAN_MS = 20;
const SEG_MIN_DT_MS = 8;
const DEAD_ZONE_SPEED = 500;
const MAX_THROW_SPEED = 3600;
const PEAK_WEIGHT = .5;
const ACCEL_REF = 8e3;
const ACCEL_GAIN_MAX = .6;
const GRAVITY = 1400;
const RESTITUTION = .78;
const GROUND_FRICTION = 2.5;
const DEFAULT_PHYSICS = {
	gravity: GRAVITY,
	restitution: RESTITUTION,
	groundFriction: GROUND_FRICTION,
	ceilingBounce: true,
	throwPower: 1,
	petCollision: false
};
const DEFAULT_THROW_POWER = 1;
const REST_VY = 40;
const REST_VX = 15;
const MAX_STEP_DT = .05;
const SQ_SQUASH = .55;
const SQ_DURATION_MS = 220;
const SQ_SOFT_SPEED = 300;
const SQ_HARD_SPEED = 1500;
const SQ_MAX_SQUASH = .55;
const landingSquash = (impactSpeed) => {
	const t = Math.min(Math.max((Math.abs(impactSpeed) - SQ_SOFT_SPEED) / (SQ_HARD_SPEED - SQ_SOFT_SPEED), 0), 1);
	return Math.min(.8, 1 - t * (1 - SQ_MAX_SQUASH));
};
const squashScale = (u, squash = SQ_SQUASH) => {
	if (u < .45) {
		const p$1 = u / .45;
		return 1 - (1 - squash) * p$1 * p$1;
	}
	const p = (u - .45) / .55;
	const c1 = 1.70158;
	const c3 = c1 + 1;
	const f = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
	return Math.min(1.12, squash + (1 - squash) * Math.max(f, 0));
};
const throwBounds = (o) => {
	const h = o.size * 9 / 16;
	return {
		minX: -o.sideAllow,
		minY: 0,
		maxX: o.W - o.size + o.sideAllow,
		maxY: o.H - h
	};
};
const throwBoundsIn = (area, size, sideAllow) => {
	const h = size * 9 / 16;
	return {
		minX: area.x - sideAllow,
		minY: area.y,
		maxX: rectRight(area) - size + sideAllow,
		maxY: rectBottom(area) - h
	};
};
const throwSpace = (o) => ({
	bounds: o.areas.map((a) => throwBoundsIn(a, o.size, o.sideAllow)),
	areas: o.areas,
	panels: o.panels && o.panels.length === o.areas.length ? o.panels : o.areas,
	size: o.size,
	sideAllow: o.sideAllow
});
const screenOfBox = (space, x, y) => {
	const cx = x + space.size / 2;
	const cy = y + space.size * 9 / 16 / 2;
	const hit = indexAtPoint(space.areas, cx, cy);
	return hit >= 0 ? hit : nearestIndex(space.areas, cx, cy);
};
const trimTrail = (trail, now) => {
	const cutoff = now - TRAIL_KEEP_MS;
	let i = 0;
	while (i < trail.length && trail[i].t < cutoff) i++;
	return i === 0 ? trail : trail.slice(i);
};
const springStep = (v, x, target, dt, power = DEFAULT_THROW_POWER) => v + ((target - x) * SPRING_K - v * SPRING_C) * power * dt;
const softClampSpeed = (speed) => {
	if (speed <= 0) return 0;
	return MAX_THROW_SPEED * (1 - Math.exp(-speed / MAX_THROW_SPEED));
};
const THROW_SPEED_ANCHOR = 1200;
const throwVelocity = (angleDeg, power) => {
	const speed = softClampSpeed(power * THROW_SPEED_ANCHOR);
	const rad = angleDeg * Math.PI / 180;
	return {
		vx: Math.cos(rad) * speed,
		vy: -Math.sin(rad) * speed
	};
};
const SLINGSHOT_REF_RATIO = .6;
const slingshotRefDist = (size) => size > 0 ? size * SLINGSHOT_REF_RATIO : 0;
const slingshotPower = (dist, size) => {
	const ref = slingshotRefDist(size);
	if (!(ref > 0) || !(dist > 0) || !Number.isFinite(dist)) return 0;
	return dist / ref;
};
const pullAngle = (pullX, pullY) => Math.atan2(pullY, -pullX) * 180 / Math.PI;
const slingshotVelocity = (angleDeg, power, throwPower = DEFAULT_THROW_POWER) => {
	const speed = THROW_SPEED_ANCHOR * Math.max(0, power) * Math.max(0, throwPower);
	if (speed === 0) return {
		vx: 0,
		vy: 0
	};
	const rad = angleDeg * Math.PI / 180;
	return {
		vx: Math.cos(rad) * speed,
		vy: -Math.sin(rad) * speed
	};
};
const estimateReleaseVelocity = (trail, now, physics = DEFAULT_PHYSICS) => {
	if (trail.length === 0) return null;
	const last = trail[trail.length - 1];
	if (now - last.t > RELEASE_STALE_MS) return null;
	const win = trail.filter((s) => now - s.t <= RELEASE_WINDOW_MS);
	if (win.length < 2) return null;
	const t0 = win[0].t;
	const x0 = win[0].x;
	const y0 = win[0].y;
	const t1 = win[win.length - 1].t;
	const x1 = win[win.length - 1].x;
	const y1 = win[win.length - 1].y;
	const spanMs = t1 - t0;
	if (spanMs < MIN_SPAN_MS) return null;
	const baseVx = (x1 - x0) / spanMs * 1e3;
	const baseVy = (y1 - y0) / spanMs * 1e3;
	const baseSpeed = Math.hypot(baseVx, baseVy);
	if (baseSpeed < 1e-6) return null;
	const segSpeeds = [];
	let px = x0;
	let py = y0;
	let pt = t0;
	for (const s of win.slice(1)) {
		const dt = s.t - pt;
		if (dt >= SEG_MIN_DT_MS) {
			segSpeeds.push({
				speed: Math.hypot(s.x - px, s.y - py) / dt * 1e3,
				tEnd: s.t
			});
			px = s.x;
			py = s.y;
			pt = s.t;
		}
	}
	const peakSpeed = segSpeeds.length ? Math.max(...segSpeeds.map((v) => v.speed)) : baseSpeed;
	let accel = 0;
	if (segSpeeds.length >= 2) {
		const lastSeg = segSpeeds[segSpeeds.length - 1];
		const firstSeg = segSpeeds[0];
		accel = (lastSeg.speed - firstSeg.speed) / Math.max((lastSeg.tEnd - firstSeg.tEnd) / 1e3, MIN_SPAN_MS / 1e3);
	}
	const speedBeforeClamp = ((1 - PEAK_WEIGHT) * baseSpeed + PEAK_WEIGHT * peakSpeed) * (1 + Math.min(Math.max(accel, 0) / ACCEL_REF, 1) * ACCEL_GAIN_MAX);
	const speed = softClampSpeed(speedBeforeClamp) * physics.throwPower;
	if (speed < DEAD_ZONE_SPEED) return null;
	return {
		vx: baseVx / baseSpeed * speed,
		vy: baseVy / baseSpeed * speed
	};
};
const throwStep = (s, dtRaw, b, physics = DEFAULT_PHYSICS) => {
	const dt = Math.min(Math.max(dtRaw, 0), MAX_STEP_DT);
	let { x, y, vx, vy } = s;
	vy += physics.gravity * dt;
	x += vx * dt;
	y += vy * dt;
	let bounced = false;
	if (x < b.minX) {
		x = b.minX;
		vx = Math.abs(vx) * physics.restitution;
		bounced = true;
	} else if (x > b.maxX) {
		x = b.maxX;
		vx = -Math.abs(vx) * physics.restitution;
		bounced = true;
	}
	if (y < b.minY) {
		if (physics.ceilingBounce) {
			y = b.minY;
			vy = Math.abs(vy) * physics.restitution;
			bounced = true;
		}
	} else if (y >= b.maxY) {
		y = b.maxY;
		vx *= Math.max(0, 1 - physics.groundFriction * dt);
		if (Math.abs(vy) < REST_VY) vy = 0;
		else vy = -Math.abs(vy) * physics.restitution;
		bounced = true;
	}
	const speed = Math.hypot(vx, vy);
	const atRest = y >= b.maxY - 1 && Math.abs(vy) < 1 && Math.abs(vx) < REST_VX || bounced && speed < REST_VY && Math.abs(vy) < 1;
	return {
		x,
		y,
		vx,
		vy,
		bounced,
		atRest
	};
};
const throwStepRegion = (s, dtRaw, space, physics = DEFAULT_PHYSICS, lockScreen = -1) => {
	const dt = Math.min(Math.max(dtRaw, 0), MAX_STEP_DT);
	let { x, y, vx, vy } = s;
	vy += physics.gravity * dt;
	x += vx * dt;
	y += vy * dt;
	if (space.areas.length === 0) return {
		x,
		y,
		vx,
		vy,
		screen: -1,
		bounced: false,
		atRest: false
	};
	const h = space.size * 9 / 16;
	let bounced = false;
	const locked = Number.isInteger(lockScreen) && lockScreen >= 0 && lockScreen < space.areas.length;
	/** 该用哪块屏的 AABB / 工作区 / 面板：锁定时恒为锁定屏，否则取身体中心所在屏 */
	const pick$1 = (i) => locked ? lockScreen : i;
	let cur = screenOfBox(space, x, y);
	let b = space.bounds[pick$1(cur)];
	let a = space.areas[pick$1(cur)];
	const pa = space.panels[pick$1(cur)] || a;
	const cy = y + h / 2;
	if (x < b.minX) {
		if (locked || indexAtPoint(space.panels, pa.x - 1, cy) < 0) {
			x = b.minX;
			vx = Math.abs(vx) * physics.restitution;
			bounced = true;
		}
	} else if (x > b.maxX) {
		if (locked || indexAtPoint(space.panels, rectRight(pa), cy) < 0) {
			x = b.maxX;
			vx = -Math.abs(vx) * physics.restitution;
			bounced = true;
		}
	}
	cur = screenOfBox(space, x, y);
	b = space.bounds[pick$1(cur)];
	a = space.areas[pick$1(cur)];
	const pa2 = space.panels[pick$1(cur)] || a;
	const cx = x + space.size / 2;
	if (y < b.minY) {
		if (physics.ceilingBounce && (locked || indexAtPoint(space.panels, cx, pa2.y - 1) < 0)) {
			y = b.minY;
			vy = Math.abs(vy) * physics.restitution;
			bounced = true;
		}
	} else if (y >= b.maxY) {
		if (locked || indexAtPoint(space.panels, cx, rectBottom(pa2)) < 0) {
			y = b.maxY;
			vx *= Math.max(0, 1 - physics.groundFriction * dt);
			if (Math.abs(vy) < REST_VY) vy = 0;
			else vy = -Math.abs(vy) * physics.restitution;
			bounced = true;
		}
	}
	cur = pick$1(screenOfBox(space, x, y));
	b = space.bounds[cur];
	const speed = Math.hypot(vx, vy);
	const atRest = y >= b.maxY - 1 && Math.abs(vy) < 1 && Math.abs(vx) < REST_VX || bounced && speed < REST_VY && Math.abs(vy) < 1;
	return {
		x,
		y,
		vx,
		vy,
		screen: cur,
		bounced,
		atRest
	};
};
const SUBSTEP_PX = 8;
const SUBSTEP_MAX = 64;
const throwSubsteps = (vx, vy, dt) => {
	const travel = Math.hypot(vx, vy) * Math.min(Math.max(dt, 0), MAX_STEP_DT);
	if (!(travel > SUBSTEP_PX)) return 1;
	return Math.min(SUBSTEP_MAX, Math.ceil(travel / SUBSTEP_PX));
};
const PET_BOUNCE_E = .995;
const bodyPixelBox = (o) => {
	const h = o.size * 9 / 16;
	return {
		left: o.x + HIT_BOX.x0 / 640 * o.size,
		top: o.y + o.bottomPad + HIT_BOX.y0 / 360 * h,
		right: o.x + HIT_BOX.x1 / 640 * o.size,
		bottom: o.y + o.bottomPad + HIT_BOX.y1 / 360 * h
	};
};
const rectsOverlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const collidePet = (fly, hit) => {
	const hf = fly.size * 9 / 16 / 2;
	const hh = hit.size * 9 / 16 / 2;
	const cx = hit.x + hit.size / 2 - (fly.x + fly.size / 2);
	const cy = hit.y + hh - (fly.y + hf);
	const dist = Math.hypot(cx, cy);
	if (dist < 1e-6) return null;
	const nx = cx / dist;
	const ny = cy / dist;
	const vrel = (fly.vx - hit.vx) * nx + (fly.vy - hit.vy) * ny;
	if (vrel <= 0) return null;
	const e = PET_BOUNCE_E;
	const m1 = fly.size * fly.size;
	const m2 = hit.size * hit.size;
	const v1n = fly.vx * nx + fly.vy * ny;
	const v2n = hit.vx * nx + hit.vy * ny;
	const v1n2 = ((m1 - e * m2) * v1n + (1 + e) * m2 * v2n) / (m1 + m2);
	const v2n2 = ((m2 - e * m1) * v2n + (1 + e) * m1 * v1n) / (m1 + m2);
	return {
		fvx: fly.vx - v1n * nx + v1n2 * nx,
		fvy: fly.vy - v1n * ny + v1n2 * ny,
		hvx: hit.vx - v2n * nx + v2n2 * nx,
		hvy: hit.vy - v2n * ny + v2n2 * ny
	};
};

//#endregion
//#region src/shared/score.ts
const SCORE_MIN_SPEED = 400;
/** 每 100 px/s 记 1 分（基准尺寸 462px 下） */
const SCORE_SPEED_PER_POINT = 100;
const clickScore = (speed, size) => {
	if (speed <= 0 || size <= 0) return 0;
	return Math.max(1, Math.round(speed / SCORE_SPEED_PER_POINT * (PET_REF_WIDTH / size)));
};

//#endregion
//#region src/shared/score-popup.ts
const SCORE_POPUP_DURATION_MS = 2200;
const SCORE_POPUP_CSS = [
	".dsh-pet-score{position:fixed;z-index:2147483002;min-width:120px;text-align:center;",
	"background:rgba(255,255,255,.97);border:1px solid rgba(255,179,0,.35);border-radius:12px;",
	"box-shadow:0 10px 32px rgba(0,0,0,.22);padding:8px 16px 9px;user-select:none;pointer-events:auto;",
	"font-family:var(--dsh-pet-font-family,'ShangshouSoftCandy','Yuanti SC','YouYuan','幼圆','Comic Sans MS','PingFang SC','Microsoft YaHei',sans-serif);}",
	".dsh-pet-score.is-in{animation:dshPetScorePop .28s ease}",
	".dsh-pet-score-val{font-size:22px;line-height:1.25;font-weight:700;color:#ff8f00;font-variant-numeric:tabular-nums}",
	".dsh-pet-score-sub{font-size:11px;line-height:1.4;color:rgba(43,43,43,.6);margin-top:2px;white-space:nowrap}",
	".dsh-pet-score-burst{position:fixed;inset:0;pointer-events:none;z-index:2147483002}",
	".dsh-pet-score-particle{position:absolute;border-radius:50%;pointer-events:none}",
	"@keyframes dshPetScorePop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}"
].join("");
/** 粒子只注入一次（同 CHAT_CSS 的 injectChatCss 模式） */
let scoreCssInjected = false;
function injectScoreCss() {
	if (scoreCssInjected || typeof document === "undefined") return;
	scoreCssInjected = true;
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-pet";
	tag.dataset.pluginCss = "dsh-pet/score";
	tag.textContent = SCORE_POPUP_CSS;
	document.head.appendChild(tag);
}
/** 粒子数量 */
const BURST_COUNT = 20;
/** 初速范围（px/s） */
const BURST_SPEED_MIN = 120;
const BURST_SPEED_MAX = 460;
/** 重力（px/s²）：粒子向上喷出后回落 */
const BURST_GRAVITY = 700;
/** 单粒子寿命范围（ms） */
const BURST_LIFE_MIN = 500;
const BURST_LIFE_MAX = 900;
/** 粒子半径范围（px） */
const BURST_RADIUS_MIN = 3;
const BURST_RADIUS_MAX = 7;
/** 暖色盘（积分/庆祝感） */
const BURST_COLORS = [
	"#ffb300",
	"#ff8f00",
	"#ff7043",
	"#f4511e",
	"#ffc400",
	"#ffd54f",
	"#ef5350"
];
function spawnScoreBurst(x, y) {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	injectScoreCss();
	const root = document.createElement("div");
	root.className = "dsh-pet-score-burst";
	document.body.appendChild(root);
	const parts = [];
	for (let i = 0; i < BURST_COUNT; i++) {
		const angle = Math.random() * Math.PI * 2;
		const speed = BURST_SPEED_MIN + Math.random() * (BURST_SPEED_MAX - BURST_SPEED_MIN);
		const r = BURST_RADIUS_MIN + Math.random() * (BURST_RADIUS_MAX - BURST_RADIUS_MIN);
		const el = document.createElement("div");
		el.className = "dsh-pet-score-particle";
		el.style.left = x + "px";
		el.style.top = y + "px";
		el.style.width = r * 2 + "px";
		el.style.height = r * 2 + "px";
		el.style.background = BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)];
		root.appendChild(el);
		parts.push({
			el,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed - 80,
			t0: performance.now(),
			life: BURST_LIFE_MIN + Math.random() * (BURST_LIFE_MAX - BURST_LIFE_MIN)
		});
	}
	const step = () => {
		const now = performance.now();
		let alive = false;
		for (const p of parts) {
			const tSec = (now - p.t0) / 1e3;
			const lifeRatio = (now - p.t0) / p.life;
			if (lifeRatio >= 1) continue;
			alive = true;
			p.el.style.transform = "translate(" + p.vx * tSec + "px," + (p.vy * tSec + .5 * BURST_GRAVITY * tSec * tSec) + "px)";
			p.el.style.opacity = String(Math.max(0, 1 - lifeRatio));
		}
		if (alive) requestAnimationFrame(step);
		else root.remove();
	};
	requestAnimationFrame(step);
}
function mountScorePopup(opts) {
	injectScoreCss();
	const x = opts.x;
	const y = opts.y;
	const root = document.createElement("div");
	root.className = "dsh-pet-score";
	const val = document.createElement("div");
	val.className = "dsh-pet-score-val";
	val.textContent = "+" + opts.score;
	const sub = document.createElement("div");
	sub.className = "dsh-pet-score-sub";
	sub.textContent = "速度 " + Math.round(opts.speed) + " · 大小 " + Math.round(opts.size);
	root.appendChild(val);
	root.appendChild(sub);
	document.body.appendChild(root);
	const rr = root.getBoundingClientRect();
	root.style.left = Math.max(4, Math.min(x - rr.width / 2, window.innerWidth - rr.width - 4)) + "px";
	root.style.top = Math.max(4, y - rr.height - 14) + "px";
	root.offsetWidth;
	root.classList.add("is-in");
	let closed = false;
	let timer = null;
	const close = () => {
		if (closed) return;
		closed = true;
		if (timer !== null) window.clearTimeout(timer);
		timer = null;
		document.removeEventListener("mousedown", onDocPointerDown, true);
		document.removeEventListener("keydown", onDocKeyDown, true);
		root.remove();
		if (opts.onClose) opts.onClose();
	};
	const mountedAt = performance.now();
	let graceConsumed = false;
	const onDocPointerDown = (e) => {
		if (closed) return;
		if (!graceConsumed) {
			graceConsumed = true;
			if (e.timeStamp - mountedAt < 300) return;
		}
		if (root.contains(e.target)) return;
		close();
	};
	const onDocKeyDown = (e) => {
		if (closed) return;
		if (e.key === "Escape") close();
	};
	document.addEventListener("mousedown", onDocPointerDown, true);
	document.addEventListener("keydown", onDocKeyDown, true);
	timer = window.setTimeout(close, SCORE_POPUP_DURATION_MS);
	return {
		el: root,
		close
	};
}

//#endregion
//#region src/shared/work-status.ts
const WORK_STATUS_STATES = [
	"thinking",
	"working",
	"result",
	"waiting",
	"success",
	"error"
];
const WORK_STATUS_INDEX = {
	thinking: 0,
	working: 1,
	result: 2,
	waiting: 3,
	success: 4,
	error: 5
};
function toWorkStatus(raw) {
	if (!raw || typeof raw !== "object") return null;
	const r = raw;
	const state = r.state === null || typeof r.state === "string" && WORK_STATUS_STATES.includes(r.state) ? r.state : null;
	return {
		state,
		task: typeof r.task === "string" ? r.task : null
	};
}

//#endregion
//#region src/shared/state.ts
/** 叶子规范化：形状不对（非对象 / counter 非数字）→ null（丢弃，不让脏数据进渲染层） */
function normLeaf(value) {
	if (!value || typeof value !== "object") return null;
	const leaf$1 = value;
	if (typeof leaf$1.counter !== "number" || !Number.isFinite(leaf$1.counter)) return null;
	return {
		counter: leaf$1.counter,
		data: leaf$1.data ?? null
	};
}
async function fetchState(baseUrl = "/dsh-pet-7340/state", wait) {
	try {
		const url = wait ? `${baseUrl}?since=${wait.since}&timeout=${wait.timeoutMs}` : baseUrl;
		const res = await fetch(url, { cache: "no-store" });
		if (!res.ok) return null;
		const raw = await res.json().catch(() => null);
		if (!raw || typeof raw !== "object") return null;
		const sections = {};
		const rawSections = raw.sections && typeof raw.sections === "object" ? raw.sections : {};
		for (const [name, value] of Object.entries(rawSections)) {
			const leaf$1 = normLeaf(value);
			if (leaf$1) sections[name] = leaf$1;
		}
		const pets = {};
		const rawPets = raw.pets && typeof raw.pets === "object" ? raw.pets : {};
		for (const [petId, entry] of Object.entries(rawPets)) {
			if (!entry || typeof entry !== "object") continue;
			const leaves = {};
			for (const [name, value] of Object.entries(entry)) {
				const leaf$1 = normLeaf(value);
				if (leaf$1) leaves[name] = leaf$1;
			}
			pets[petId] = leaves;
		}
		return {
			counter: typeof raw.counter === "number" && Number.isFinite(raw.counter) ? raw.counter : void 0,
			sections,
			pets
		};
	} catch {
		return null;
	}
}
/** 遍历 S 的所有叶子（顺序：sections 在前、pets 在后） */
function* walkLeaves(s) {
	for (const [name, leaf$1] of Object.entries(s.sections ?? {})) yield ["sections." + name, leaf$1];
	for (const [petId, leaves] of Object.entries(s.pets ?? {})) for (const [name, leaf$1] of Object.entries(leaves ?? {})) yield ["pets." + petId + "." + name, leaf$1];
}
function flattenCounters(s) {
	const out = {};
	for (const [path, leaf$1] of walkLeaves(s)) out[path] = leaf$1.counter;
	return out;
}
function takeChanged(s, baseline) {
	const out = [];
	for (const [path, leaf$1] of walkLeaves(s)) {
		if (baseline[path] === leaf$1.counter) continue;
		baseline[path] = leaf$1.counter;
		out.push({
			path,
			leaf: leaf$1
		});
	}
	return out;
}
function readBalance(leaf$1) {
	const state = toBalanceState(leaf$1.data);
	if (!state) return null;
	const manual = leaf$1.data.manual === true;
	return {
		state,
		manual
	};
}
function readSay(leaf$1) {
	if (!leaf$1.data || typeof leaf$1.data !== "object") return null;
	const d = leaf$1.data;
	if (d.clear === true) return { kind: "clear" };
	if (typeof d.text !== "string" || !d.text) return null;
	return {
		kind: "say",
		text: d.text,
		image: typeof d.image === "string" ? d.image : void 0,
		url: typeof d.url === "string" ? d.url : void 0,
		duration: typeof d.duration === "number" && Number.isFinite(d.duration) && d.duration >= 0 ? d.duration : void 0,
		anim: typeof d.anim === "boolean" ? d.anim : void 0
	};
}
function readWorkStatus(leaf$1) {
	return toWorkStatus(leaf$1.data);
}
function readAnim(leaf$1) {
	if (!leaf$1.data || typeof leaf$1.data !== "object") return null;
	const d = leaf$1.data;
	const name = typeof d.name === "string" && d.name ? d.name : void 0;
	const url = typeof d.url === "string" && d.url ? d.url : void 0;
	if (name === void 0 && url === void 0) return null;
	return {
		name,
		url,
		playbackId: typeof d.playbackId === "string" && d.playbackId ? d.playbackId : void 0,
		facing: d.facing === "left" || d.facing === "right" ? d.facing : void 0
	};
}
function readLock(leaf$1) {
	if (!leaf$1.data || typeof leaf$1.data !== "object") return null;
	const d = leaf$1.data;
	if (d.locked === false) return { locked: false };
	if (d.locked !== true) return null;
	if (typeof d.expiresAt !== "number" || !Number.isFinite(d.expiresAt)) return null;
	return {
		locked: true,
		expiresAt: d.expiresAt
	};
}
function readPosition(leaf$1) {
	if (!leaf$1.data || typeof leaf$1.data !== "object") return null;
	const d = leaf$1.data;
	if (typeof d.x !== "number" || !Number.isFinite(d.x)) return null;
	if (typeof d.y !== "number" || !Number.isFinite(d.y)) return null;
	if (d.mode !== "instant" && d.mode !== "spring" && d.mode !== "line") return null;
	if (d.mode === "line") {
		if (typeof d.duration !== "number" || !Number.isFinite(d.duration) || d.duration < 0) return null;
		return {
			x: d.x,
			y: d.y,
			mode: "line",
			duration: d.duration
		};
	}
	return {
		x: d.x,
		y: d.y,
		mode: d.mode,
		duration: 0
	};
}
function readThrow(leaf$1) {
	if (!leaf$1.data || typeof leaf$1.data !== "object") return null;
	const d = leaf$1.data;
	if (typeof d.angle !== "number" || !Number.isFinite(d.angle)) return null;
	if (typeof d.power !== "number" || !Number.isFinite(d.power) || d.power <= 0) return null;
	return {
		angle: d.angle,
		power: d.power
	};
}
async function postAction(baseUrl, body) {
	try {
		const res = await fetch(baseUrl, {
			method: "POST",
			...body === void 0 ? {} : {
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body)
			}
		});
		if (!res.ok) return false;
		const data = await res.json().catch(() => null);
		return data?.ok === true;
	} catch {
		return false;
	}
}

//#endregion
//#region src/shared/tooltip.ts
const TOOLTIP_CLASS = "pet-tooltip";
const TOOLTIP_GAP_RATIO = .022;
function tooltipPlacement(cursor, tip, bounds, gap) {
	const clamp = (v, lo, hi) => hi < lo ? lo : Math.min(Math.max(v, lo), hi);
	const rightMax = bounds.x + bounds.w;
	const bottomMax = bounds.y + bounds.h;
	let x = cursor.x + gap;
	if (x + tip.w > rightMax) x = cursor.x - gap - tip.w;
	x = clamp(x, bounds.x, rightMax - tip.w);
	let y = cursor.y + gap;
	if (y + tip.h > bottomMax) y = cursor.y - gap - tip.h;
	y = clamp(y, bounds.y, bottomMax - tip.h);
	return {
		x,
		y
	};
}
const TOOLTIP_CSS = [
	".pet-tooltip{",
	"position:fixed;left:0;top:0;",
	"max-width:calc(var(--dsh-pet-size,var(--pet-size,462px))*0.8);",
	"padding:calc(var(--dsh-pet-size,var(--pet-size,462px))*0.010) calc(var(--dsh-pet-size,var(--pet-size,462px))*0.021);",
	"border-radius:calc(var(--dsh-pet-size,var(--pet-size,462px))*0.016);",
	"background:rgba(255,255,255,.96);color:#1f1f1f;",
	"border:1px solid rgba(0,0,0,.12);",
	"font-family:var(--dsh-pet-font-family,\"ShangshouSoftCandy\",\"Yuanti SC\",\"YouYuan\",\"幼圆\",\"Comic Sans MS\",\"PingFang SC\",\"Microsoft YaHei\",sans-serif);",
	"font-size:var(--dsh-pet-font-tip,calc(var(--dsh-pet-size,var(--pet-size,462px))*0.026));line-height:1.4;",
	"white-space:nowrap;overflow:hidden;text-overflow:ellipsis;",
	"box-shadow:0 calc(var(--dsh-pet-size,var(--pet-size,462px))*0.004) calc(var(--dsh-pet-size,var(--pet-size,462px))*0.013) rgba(0,0,0,.18);",
	"opacity:0;transition:opacity .12s ease;pointer-events:none;z-index:2}",
	".pet-tooltip.is-on{opacity:1}"
].join("");

//#endregion
exports.ACCEL_GAIN_MAX = ACCEL_GAIN_MAX
exports.ACCEL_REF = ACCEL_REF
exports.ANIMATION_EXT = ANIMATION_EXT
exports.BUBBLE_FONT_BASE_PX = BUBBLE_FONT_BASE_PX
exports.BUBBLE_METRICS = BUBBLE_METRICS
exports.BUBBLE_OVERLAP_RATIO = BUBBLE_OVERLAP_RATIO
exports.CANVAS_H = CANVAS_H
exports.CHAT_CSS = CHAT_CSS
exports.DEAD_ZONE_SPEED = DEAD_ZONE_SPEED
exports.DEFAULT_FONT = DEFAULT_FONT
exports.DEFAULT_PHYSICS = DEFAULT_PHYSICS
exports.DEFAULT_ROLLING_LABEL = DEFAULT_ROLLING_LABEL
exports.DEFAULT_THROW_POWER = DEFAULT_THROW_POWER
exports.DRAG_THRESHOLD = DRAG_THRESHOLD
exports.FEET_Y = FEET_Y
exports.FONT_PRESETS = FONT_PRESETS
exports.FONT_REF_SIZE = FONT_REF_SIZE
exports.FONT_SIZE_MAX = FONT_SIZE_MAX
exports.FONT_SIZE_MIN = FONT_SIZE_MIN
exports.GRAVITY = GRAVITY
exports.GROUND_FRICTION = GROUND_FRICTION
exports.HANDLERS = HANDLERS
exports.HIT_BOX = HIT_BOX
exports.MAX_BODY = MAX_BODY
exports.MAX_STEP_DT = MAX_STEP_DT
exports.MAX_THROW_SPEED = MAX_THROW_SPEED
exports.MEME_BUBBLE_CLASS = MEME_BUBBLE_CLASS
exports.MEME_BUBBLE_CSS = MEME_BUBBLE_CSS
exports.MEME_IMG_CLASS = MEME_IMG_CLASS
exports.MENU_CSS = MENU_CSS
exports.MIN_SPAN_MS = MIN_SPAN_MS
exports.MORE_MENU_LABEL = MORE_MENU_LABEL
exports.NOTIFY_ICONS = NOTIFY_ICONS
exports.PEAK_WEIGHT = PEAK_WEIGHT
exports.PET_BOUNCE_E = PET_BOUNCE_E
exports.PET_DISPLAYS = PET_DISPLAYS
exports.PET_REF_WIDTH = PET_REF_WIDTH
exports.QUOTA_CRIT_PERCENT = QUOTA_CRIT_PERCENT
exports.QUOTA_WARN_PERCENT = QUOTA_WARN_PERCENT
exports.RELEASE_STALE_MS = RELEASE_STALE_MS
exports.RELEASE_WINDOW_MS = RELEASE_WINDOW_MS
exports.RESTITUTION = RESTITUTION
exports.REST_VX = REST_VX
exports.REST_VY = REST_VY
exports.SCORE_MIN_SPEED = SCORE_MIN_SPEED
exports.SCORE_POPUP_CSS = SCORE_POPUP_CSS
exports.SCORE_POPUP_DURATION_MS = SCORE_POPUP_DURATION_MS
exports.SEG_MIN_DT_MS = SEG_MIN_DT_MS
exports.SLINGSHOT_DOUBLE_MS = SLINGSHOT_DOUBLE_MS
exports.SLINGSHOT_REF_RATIO = SLINGSHOT_REF_RATIO
exports.SPRING_C = SPRING_C
exports.SPRING_K = SPRING_K
exports.SQ_DURATION_MS = SQ_DURATION_MS
exports.SQ_HARD_SPEED = SQ_HARD_SPEED
exports.SQ_MAX_SQUASH = SQ_MAX_SQUASH
exports.SQ_SOFT_SPEED = SQ_SOFT_SPEED
exports.SQ_SQUASH = SQ_SQUASH
exports.SUBSTEP_MAX = SUBSTEP_MAX
exports.SUBSTEP_PX = SUBSTEP_PX
exports.THROW_SPEED_ANCHOR = THROW_SPEED_ANCHOR
exports.TIP_FONT_BASE_PX = TIP_FONT_BASE_PX
exports.TOOLTIP_CLASS = TOOLTIP_CLASS
exports.TOOLTIP_CSS = TOOLTIP_CSS
exports.TOOLTIP_GAP_RATIO = TOOLTIP_GAP_RATIO
exports.TRAIL_KEEP_MS = TRAIL_KEEP_MS
exports.WINDOW_LABELS = WINDOW_LABELS
exports.WORK_STATUS_INDEX = WORK_STATUS_INDEX
exports.WORK_STATUS_STATES = WORK_STATUS_STATES
exports.anchorPixel = anchorPixel
exports.balanceBubbleView = balanceBubbleView
exports.balanceDetailView = balanceDetailView
exports.balanceEventIndex = balanceEventIndex
exports.balancePercent = balancePercent
exports.bodyPixelBox = bodyPixelBox
exports.boundingRect = boundingRect
exports.bubbleMaxHeightPx = bubbleMaxHeightPx
exports.bubbleTopMarginPx = bubbleTopMarginPx
exports.buildMenuTree = buildMenuTree
exports.buildMoreBranch = buildMoreBranch
exports.clampPointInRect = clampPointInRect
exports.clampPointToRegion = clampPointToRegion
exports.clickScore = clickScore
exports.collidePet = collidePet
exports.createMemeImage = createMemeImage
exports.createMemeImageFromUrl = createMemeImageFromUrl
exports.decideBalanceNotice = decideBalanceNotice
exports.displayMenuBranch = displayMenuBranch
exports.distToRectSq = distToRectSq
exports.estimateReleaseVelocity = estimateReleaseVelocity
exports.fetchState = fetchState
exports.flattenConfigPets = flattenConfigPets
exports.flattenCounters = flattenCounters
exports.fontStackOf = fontStackOf
exports.frameToToast = frameToToast
exports.indexAtPoint = indexAtPoint
exports.injectMemeBubbleCss = injectMemeBubbleCss
exports.isDesktopVisible = isDesktopVisible
exports.isEventAnim = isEventAnim
exports.isNoMirrorAnimation = isNoMirrorAnimation
exports.isWebVisible = isWebVisible
exports.landingSquash = landingSquash
exports.memeImageUrl = memeImageUrl
exports.mountChatDialog = mountChatDialog
exports.mountContextMenu = mountContextMenu
exports.mountScorePopup = mountScorePopup
exports.nearestIndex = nearestIndex
exports.nextWorkStatusAnim = nextWorkStatusAnim
exports.pick = pick
exports.pickCategoryAction = pickCategoryAction
exports.pickSlot = pickSlot
exports.pickWeightedCategory = pickWeightedCategory
exports.planMove = planMove
exports.pointInRect = pointInRect
exports.poolIncludes = poolIncludes
exports.postAction = postAction
exports.pullAngle = pullAngle
exports.quotaTone = quotaTone
exports.randomBetween = randomBetween
exports.readAnim = readAnim
exports.readBalance = readBalance
exports.readLock = readLock
exports.readMenuItems = readMenuItems
exports.readPosition = readPosition
exports.readSay = readSay
exports.readThrow = readThrow
exports.readWorkStatus = readWorkStatus
exports.rectAtPoint = rectAtPoint
exports.rectBottom = rectBottom
exports.rectRight = rectRight
exports.rectsOverlap = rectsOverlap
exports.regionArea = regionArea
exports.regionHoleRatio = regionHoleRatio
exports.resetInText = resetInText
exports.resolveFontPx = resolveFontPx
exports.resolveRect = resolveRect
exports.rollKind = rollKind
exports.screenOfBox = screenOfBox
exports.sendChat = sendChat
exports.slingshotPower = slingshotPower
exports.slingshotRefDist = slingshotRefDist
exports.slingshotVelocity = slingshotVelocity
exports.slotIncludes = slotIncludes
exports.softClampSpeed = softClampSpeed
exports.spawnScoreBurst = spawnScoreBurst
exports.springStep = springStep
exports.squashScale = squashScale
exports.takeChanged = takeChanged
exports.throwBounds = throwBounds
exports.throwBoundsIn = throwBoundsIn
exports.throwSpace = throwSpace
exports.throwStep = throwStep
exports.throwStepRegion = throwStepRegion
exports.throwSubsteps = throwSubsteps
exports.throwVelocity = throwVelocity
exports.toBalanceState = toBalanceState
exports.toWorkStatus = toWorkStatus
exports.tooltipPlacement = tooltipPlacement
exports.translateRects = translateRects
exports.trimTrail = trimTrail
exports.truncate = truncate
exports.urgentWindow = urgentWindow
exports.whisperBubbleView = whisperBubbleView
exports.windowsHandler = windowsHandler
return exports;
})({});