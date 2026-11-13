// [accounts] 이용약관·개인정보처리방침·마케팅 수신동의.
// D1 0007 이 아직 없으면 컬럼이 없다 — 로그인·조회는 되고, 동의 저장만 건너뛴다.
export const TERMS_VERSION = "2026-11-13";
export const PRIVACY_VERSION = "2026-11-13";
export const TERMS_PATH = "/terms.html";
export const PRIVACY_PATH = "/privacy.html";

const schemaCache = new WeakMap();

export function consentPublicConfig() {
  return {
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    termsUrl: TERMS_PATH,
    privacyUrl: PRIVACY_PATH,
  };
}

export function hasEmail(acc) {
  return !!String(acc?.email || "").trim();
}

export function parseConsentInput(body) {
  const termsVersion = typeof body?.termsVersion === "string" ? body.termsVersion.trim() : "";
  const privacyVersion = typeof body?.privacyVersion === "string" ? body.privacyVersion.trim() : "";
  const marketingOptIn = body?.marketingOptIn === true || body?.marketingOptIn === 1 || body?.marketingOptIn === "1";
  const requiredOk = termsVersion === TERMS_VERSION && privacyVersion === PRIVACY_VERSION;
  return { termsVersion, privacyVersion, marketingOptIn, requiredOk };
}

export function consentOf(acc) {
  const mail = hasEmail(acc);
  if (!acc || !("terms_version" in acc)) {
    return {
      termsVersion: null,
      termsAgreedAt: null,
      privacyVersion: null,
      privacyAgreedAt: null,
      marketingOptIn: false,
      marketingUpdatedAt: null,
      needsTerms: true,
      hasEmail: mail,
    };
  }
  const termsOk = acc.terms_version === TERMS_VERSION;
  const privacyOk = acc.privacy_version === PRIVACY_VERSION;
  return {
    termsVersion: acc.terms_version || null,
    termsAgreedAt: acc.terms_agreed_at ?? null,
    privacyVersion: acc.privacy_version || null,
    privacyAgreedAt: acc.privacy_agreed_at ?? null,
    marketingOptIn: Number(acc.marketing_opt_in) === 1,
    marketingUpdatedAt: acc.marketing_updated_at ?? null,
    needsTerms: !termsOk || !privacyOk,
    hasEmail: mail,
  };
}

export async function consentColumnsReady(db) {
  if (schemaCache.has(db)) return schemaCache.get(db);
  try {
    await db.prepare("SELECT terms_version, privacy_version, marketing_opt_in FROM accounts LIMIT 1").first();
    schemaCache.set(db, true);
    return true;
  } catch {
    schemaCache.set(db, false);
    return false;
  }
}

/** 테스트에서 스키마 캐시를 비운다 */
export function resetConsentSchemaCache() {
  // WeakMap 은 clear 가 없어 새 인스턴스를 쓰지 못하고, 키별 삭제는 호출 쪽에서 db 를 넘긴다.
}

export function forgetConsentSchema(db) {
  try { schemaCache.delete(db); } catch { /* noop */ }
}

async function insertLog(db, rows) {
  if (!rows.length) return;
  await db.batch(
    rows.map(({ accountId, kind, version, action, at }) =>
      db
        .prepare("INSERT INTO consent_log (account_id, kind, version, action, at) VALUES (?, ?, ?, ?, ?)")
        .bind(accountId, kind, version, action, at),
    ),
  );
}

/**
 * 필수 약관·방침 동의 저장 (+ 선택 마케팅).
 * @returns {Promise<{ ok:true, marketing:'on'|'off'|'no_email' } | { ok:false, error:string }>}
 */
export async function saveRequiredConsent(db, account, input, now = Date.now()) {
  if (!account?.id) return { ok: false, error: "server" };
  if (!input?.requiredOk) return { ok: false, error: "consent_required" };
  if (!(await consentColumnsReady(db))) return { ok: false, error: "consent_schema_missing" };
  const mail = hasEmail(account);
  const wantMarket = !!input.marketingOptIn;
  const marketOn = wantMarket && mail;
  const marketing = wantMarket && !mail ? "no_email" : marketOn ? "on" : "off";
  const prevMarket = Number(account.marketing_opt_in) === 1;
  await db
    .prepare(
      `UPDATE accounts SET
         terms_version = ?, terms_agreed_at = ?,
         privacy_version = ?, privacy_agreed_at = ?,
         marketing_opt_in = ?,
         marketing_agreed_at = CASE WHEN ? = 1 THEN ? ELSE marketing_agreed_at END,
         marketing_updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      TERMS_VERSION,
      now,
      PRIVACY_VERSION,
      now,
      marketOn ? 1 : 0,
      marketOn ? 1 : 0,
      now,
      now,
      account.id,
    )
    .run();
  const logs = [
    { accountId: account.id, kind: "terms", version: TERMS_VERSION, action: "agree", at: now },
    { accountId: account.id, kind: "privacy", version: PRIVACY_VERSION, action: "agree", at: now },
  ];
  if (wantMarket && !mail) {
    logs.push({ accountId: account.id, kind: "marketing", version: null, action: "skip_no_email", at: now });
  } else if (marketOn !== prevMarket || wantMarket) {
    logs.push({
      accountId: account.id,
      kind: "marketing",
      version: null,
      action: marketOn ? "agree" : "withdraw",
      at: now,
    });
  }
  try {
    await insertLog(db, logs);
  } catch {
    // 로그 테이블이 없어도 동의 저장은 유지
  }
  return { ok: true, marketing };
}

/**
 * 마케팅 수신동의만 변경.
 * @returns {Promise<{ ok:true, marketing:'on'|'off' } | { ok:false, error:string }>}
 */
export async function saveMarketingOptIn(db, account, optIn, now = Date.now()) {
  if (!account?.id) return { ok: false, error: "server" };
  if (!(await consentColumnsReady(db))) return { ok: false, error: "consent_schema_missing" };
  const want = !!optIn;
  if (want && !hasEmail(account)) return { ok: false, error: "no_email" };
  await db
    .prepare(
      `UPDATE accounts SET
         marketing_opt_in = ?,
         marketing_agreed_at = CASE WHEN ? = 1 THEN ? ELSE marketing_agreed_at END,
         marketing_updated_at = ?
       WHERE id = ?`,
    )
    .bind(want ? 1 : 0, want ? 1 : 0, now, now, account.id)
    .run();
  try {
    await insertLog(db, [
      { accountId: account.id, kind: "marketing", version: null, action: want ? "agree" : "withdraw", at: now },
    ]);
  } catch { /* 로그 테이블이 없어도 토글은 유지 */ }
  return { ok: true, marketing: want ? "on" : "off" };
}
