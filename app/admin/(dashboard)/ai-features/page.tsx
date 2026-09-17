import { requireUser, resolvePermissions } from "@/lib/auth";
import { getFeatureSettings } from "@/lib/ai/keys";
import { prisma } from "@/lib/db";
import {
  addAiKey,
  saveFeatureSettings,
  getMaskedAiKeys,
  resetFeatureSettingsToDefault,
  findOrphanedAiMedia,
  getFailRateStats,
} from "@/lib/aiKeyAdmin";
import { AiKeyRow } from "@/components/admin/AiKeyRow";
import { OrphanedMediaPanel } from "@/components/admin/OrphanedMediaPanel";
import { AiFeaturesTabs } from "@/components/admin/AiFeaturesTabs";
import { StorySettingsPanel } from "@/components/admin/StorySettingsPanel";
import { getDefaultStorySettings, getEffectiveStorySettings } from "@/lib/ai/storySettings";

/**
 * Re-verified against the live admin/ai-features.php's rendered HTML — the
 * real page is a 4-tab interface (API Keys / Feature Toggles / Fail Rate /
 * Cleanup) with a pill-style user selector, not the single stacked page
 * with a dropdown that an earlier pass built. Fail Rate (admin/editor
 * only) was entirely missing before this pass.
 */
export default async function AiFeaturesPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const { user: userParam } = await searchParams;
  const me = await requireUser();
  if (!me) return null;

  const permissions = resolvePermissions(me);
  const isAdmin = me.role === "admin";

  // Real bug fixed here: this page gated "can manage API keys for other
  // users" on `canManageAllPosts(..., "edit")` — the `blogs.edit_all`
  // permission, which is about editing every post on the site and has
  // nothing to do with API-key management. An editor who was explicitly
  // granted the actual `settings.api_keys` permission still hit the
  // "ask an admin" message, because that permission was never the one
  // being checked here at all.
  //
  // Three tiers now, matching the pattern already used on
  // Dashboard/Analytics: an admin manages any user's keys; an editor
  // holding `settings.api_keys` manages their own PLUS their own
  // `createdById`-assigned authors' — never the whole site; anyone else
  // (an author, or an editor without this specific permission) manages
  // only their own, with no user-switcher shown at all.
  const hasApiKeyPermission = isAdmin || Boolean(permissions.settings.api_keys);
  const canSwitchUsers = isAdmin || (me.role === "editor" && Boolean(permissions.settings.api_keys));
  const canManageAllUsers = isAdmin; // Site-wide reach for Fail Rate / Cleanup stays admin-only — those are broad analysis tools, not "manage my team's keys" like this permission grants.

  const switchableUsers = isAdmin
    ? await prisma.user.findMany({ orderBy: { username: "asc" }, select: { id: true, username: true } })
    : canSwitchUsers
      ? await prisma.user.findMany({
          where: { OR: [{ id: me.id }, { createdById: me.id }] },
          orderBy: { username: "asc" },
          select: { id: true, username: true },
        })
      : [];
  const allowedTargetIds = new Set(switchableUsers.map((u) => u.id));
  const targetUserId = canSwitchUsers && userParam && allowedTargetIds.has(parseInt(userParam, 10)) ? parseInt(userParam, 10) : me.id;

  const [keys, featureSettings, allUsers, orphaned, failRates] = await Promise.all([
    getMaskedAiKeys(targetUserId),
    getFeatureSettings(me.id),
    Promise.resolve(switchableUsers),
    canManageAllUsers ? findOrphanedAiMedia(null) : Promise.resolve([]),
    canManageAllUsers ? getFailRateStats() : Promise.resolve([]),
  ]);

  const [storyDefault, myStoryOverrideRow, myEffectiveStory] = await Promise.all([
    getDefaultStorySettings(),
    prisma.aiFeatureSettings.findUnique({ where: { userId: me.id }, select: { chapterCount: true, introWords: true, chapterWords: true } }),
    getEffectiveStorySettings(me.id),
  ]);
  const geminiKeys = keys.filter((k) => k.provider === "gemini");
  const cloudflareKeys = keys.filter((k) => k.provider === "cloudflare");

  const keysPanel = (
    <>
      {canSwitchUsers && (
        <div className="aif-user-selector">
          {allUsers.map((u) => (
            <a key={u.id} href={`/admin/ai-features?user=${u.id}#keys`} className={`aif-user-pill${u.id === targetUserId ? " active" : ""}`}>
              {u.username}
            </a>
          ))}
        </div>
      )}
      {/* Real bug fixed here: this whole key-management form (below) and
          this info-box were both gated on the same flag that used to mean
          "can edit every post on the site" — so an editor who could not
          manage the WHOLE SITE's keys got nothing at all, not even a way
          to manage their OWN. Now the info-box only shows for someone
          with no key-management right whatsoever (an author, or an
          editor never granted settings.api_keys); anyone with the
          permission — including for just themselves — gets the real
          form below. */}
      {!hasApiKeyPermission && (
        <div className="aif-info-box">
          <i className="fas fa-info-circle" />
          <p>API key management is handled by an admin or editor on your behalf — ask them to add Gemini/Cloudflare keys for your account.</p>
        </div>
      )}

      {hasApiKeyPermission && (
        <>
          <div className="aif-card">
            <div className="aif-card-header">
              <h3>
                Gemini <span className="provider-badge gemini">gemini</span>
              </h3>
            </div>
            {geminiKeys.map((k) => (
              <AiKeyRow
                key={k.id}
                id={k.id}
                label={k.label}
                maskedKey={k.apiKey}
                cfAccountId={k.cfAccountId}
                successCount={k.successCount}
                failCount={k.failCount}
                isActive={k.isActive}
                targetUserId={targetUserId}
                isCloudflare={false}
              />
            ))}
            <form action={addAiKey} className="aif-add-form">
              <input type="hidden" name="provider" value="gemini" />
              <input type="hidden" name="targetUserId" value={targetUserId} />
              <input name="label" className="aif-input" placeholder="Label" style={{ width: 110 }} />
              <input name="apiKey" className="aif-input" placeholder="Gemini API key" required style={{ flex: 1, minWidth: 220 }} />
              <button type="submit" className="aif-btn primary">
                <i className="fas fa-plus" /> Add
              </button>
            </form>
          </div>

          <div className="aif-card">
            <div className="aif-card-header">
              <h3>
                Cloudflare <span className="provider-badge cloudflare">image only</span>
              </h3>
            </div>
            {cloudflareKeys.map((k) => (
              <AiKeyRow
                key={k.id}
                id={k.id}
                label={k.label}
                maskedKey={k.apiKey}
                cfAccountId={k.cfAccountId}
                successCount={k.successCount}
                failCount={k.failCount}
                isActive={k.isActive}
                targetUserId={targetUserId}
                isCloudflare
              />
            ))}
            <form action={addAiKey} className="aif-add-form">
              <input type="hidden" name="provider" value="cloudflare" />
              <input type="hidden" name="targetUserId" value={targetUserId} />
              <input name="label" className="aif-input" placeholder="Label" style={{ width: 100 }} />
              <input name="cfAccountId" className="aif-input" placeholder="Account ID" required style={{ width: 160 }} />
              <input name="apiKey" className="aif-input" placeholder="API Token" required style={{ flex: 1, minWidth: 180 }} />
              <button type="submit" className="aif-btn primary">
                <i className="fas fa-plus" /> Add
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );

  const settingsPanel = (
    <div className="aif-card">
      <div className="aif-card-header">
        <h3>
          <i className="fas fa-user-cog" /> My Personal Toggles
        </h3>
        <form action={resetFeatureSettingsToDefault.bind(null, me.id)}>
          <button type="submit" className="aif-btn sm">
            Reset to Default
          </button>
        </form>
      </div>
      <form action={saveFeatureSettings}>
        <input type="hidden" name="targetUserId" value={me.id} />
        {[
          { name: "generateTitle", label: "Generate Title", checked: featureSettings.generateTitle },
          { name: "generateContent", label: "Generate Content", checked: featureSettings.generateContent },
          { name: "generateSeo", label: "Generate SEO", checked: featureSettings.generateSeo },
          { name: "generateThumbnail", label: "Generate Thumbnail", checked: featureSettings.generateThumbnail },
        ].map((toggle) => (
          <div className="aif-settings-row" key={toggle.name}>
            <div className="aif-settings-info">
              <h4>{toggle.label}</h4>
            </div>
            <label className="switch-toggle">
              <input type="checkbox" name={toggle.name} defaultChecked={toggle.checked} />
              <span className="slider" />
            </label>
          </div>
        ))}
        <div style={{ marginTop: "1.5rem", display: "flex", gap: 10 }}>
          <button type="submit" className="aif-btn primary">
            <i className="fas fa-save" /> Save My Settings
          </button>
        </div>
      </form>
    </div>
  );

  const statsPanel = canManageAllUsers ? (
    <div className="aif-card">
      <div className="aif-card-header">
        <h3>
          <i className="fas fa-chart-line" /> API Health (Last 30 Days)
        </h3>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="aif-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Provider</th>
              <th>Success</th>
              <th>Fail</th>
              <th>Fail Rate</th>
            </tr>
          </thead>
          <tbody>
            {failRates.map((row, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{row.username}</td>
                <td>
                  <span className={`provider-badge ${row.provider}`}>{row.provider}</span>
                </td>
                <td style={{ color: "#16a34a", fontWeight: 600 }}>{row.success}</td>
                <td style={{ color: "#dc2626", fontWeight: 600 }}>{row.fail}</td>
                <td style={{ fontWeight: 700, color: row.failRatePercent > 30 ? "#dc2626" : row.failRatePercent > 10 ? "#f59e0b" : "#16a34a" }}>
                  {row.failRatePercent}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : null;

  const cleanupPanel = canManageAllUsers ? (
    <div className="aif-card">
      <div className="aif-card-header">
        <h3>
          <i className="fas fa-broom" /> Unused AI Images
        </h3>
      </div>
      <div className="aif-info-box">
        <i className="fas fa-info-circle" />
        <p>Ye wo images hain jo AI ne generate ki thi par kisi bhi post me featured image ki tarah use nahi ho rahi hain. Inhe delete karke aap disk space bacha sakte hain.</p>
      </div>
      <OrphanedMediaPanel items={orphaned} />
    </div>
  ) : null;

  return (
    <div>
      <AiFeaturesTabs
        keysPanel={keysPanel}
        settingsPanel={settingsPanel}
        storyPanel={
          <StorySettingsPanel
            isAdmin={me.role === "admin"}
            siteDefault={storyDefault}
            myOverride={{
              chapterCount: myStoryOverrideRow?.chapterCount ?? null,
              introWords: myStoryOverrideRow?.introWords ?? null,
              chapterWords: myStoryOverrideRow?.chapterWords ?? null,
            }}
            effective={myEffectiveStory}
          />
        }
        statsPanel={statsPanel}
        cleanupPanel={cleanupPanel}
        showStats={canManageAllUsers}
      />
    </div>
  );
}
