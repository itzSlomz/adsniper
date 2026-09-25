jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("@/jobs/index", () => ({ triggerJob: jest.fn() }));
jest.mock("@/lib/sampleData", () => ({
  clearSampleData: jest.fn(),
  loadSampleData: jest.fn(),
}));
jest.mock("@/lib/storage", () => ({
  checkStorage: jest.fn(),
  getStorage: jest.fn(),
}));
jest.mock("@/lib/sharpOptional", () => ({ makeThumbnail: jest.fn() }));
jest.mock("@/lib/settings", () => ({
  getMentionsSettings: jest.fn(),
  saveInstanceSettings: jest.fn(),
  saveMentionsSettings: jest.fn(),
  saveOfferCategories: jest.fn(),
  savePullSettings: jest.fn(),
}));
jest.mock("@/jobs/mentions", () => ({ eraseMention: jest.fn() }));
jest.mock("@/lib/mentions/config", () => ({
  MENTIONS_MAX_TERMS_PER_BRAND: 8,
  classifierMode: jest.fn(),
}));
jest.mock("@/lib/mentions/queries", () => ({ resolveMentionRef: jest.fn() }));
jest.mock("@/lib/db", () => ({
  prisma: {
    ad: { create: jest.fn() },
    brand: {
      count: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    dailyBrief: { update: jest.fn() },
    post: { upsert: jest.fn() },
    user: {
      delete: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    weeklyBrief: { update: jest.fn() },
  },
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  clearSamples,
  loadSamples,
  runNow,
  testStorage,
} from "@/app/(dash)/intel/actions";
import {
  createBrand,
  resolveNow,
  saveBrand,
  toggleBrand,
} from "@/app/(dash)/intel/brands/actions";
import {
  regenerate as regenerateDaily,
  save as saveDaily,
} from "@/app/(dash)/intel/brief/actions";
import { logAd } from "@/app/(dash)/intel/log-ad/actions";
import {
  pullNow,
  removeMention,
  saveMentionSettings,
} from "@/app/(dash)/intel/mentions/actions";
import { addPost } from "@/app/(dash)/intel/quick-add-post/actions";
import {
  save as savePull,
  saveInstance,
  saveOffers,
} from "@/app/(dash)/intel/settings/actions";
import { addUser, removeUser } from "@/app/(dash)/intel/users/actions";
import {
  regenerate as regenerateWeekly,
  save as saveWeekly,
} from "@/app/(dash)/intel/weekly-brief/actions";
import { triggerJob } from "@/jobs/index";
import { eraseMention } from "@/jobs/mentions";
import { prisma } from "@/lib/db";
import { classifierMode } from "@/lib/mentions/config";
import { resolveMentionRef } from "@/lib/mentions/queries";
import { clearSampleData, loadSampleData } from "@/lib/sampleData";
import { makeThumbnail } from "@/lib/sharpOptional";
import {
  getMentionsSettings,
  saveInstanceSettings,
  saveMentionsSettings,
  saveOfferCategories,
  savePullSettings,
} from "@/lib/settings";
import { checkStorage, getStorage } from "@/lib/storage";

const authMock = auth as jest.Mock;
const revalidatePathMock = revalidatePath as jest.Mock;
const redirectMock = redirect as unknown as jest.Mock;
const triggerJobMock = triggerJob as jest.Mock;
const clearSampleDataMock = clearSampleData as jest.Mock;
const loadSampleDataMock = loadSampleData as jest.Mock;
const checkStorageMock = checkStorage as jest.Mock;
const getStorageMock = getStorage as jest.Mock;
const makeThumbnailMock = makeThumbnail as jest.Mock;
const saveInstanceSettingsMock = saveInstanceSettings as jest.Mock;
const saveOfferCategoriesMock = saveOfferCategories as jest.Mock;
const savePullSettingsMock = savePullSettings as jest.Mock;
const getMentionsSettingsMock = getMentionsSettings as jest.Mock;
const saveMentionsSettingsMock = saveMentionsSettings as jest.Mock;
const eraseMentionMock = eraseMention as jest.Mock;
const classifierModeMock = classifierMode as jest.Mock;
const resolveMentionRefMock = resolveMentionRef as jest.Mock;

const dbMocks = {
  adCreate: prisma.ad.create as jest.Mock,
  brandCount: prisma.brand.count as jest.Mock,
  brandCreate: prisma.brand.create as jest.Mock,
  brandFindUniqueOrThrow: prisma.brand.findUniqueOrThrow as jest.Mock,
  brandUpdate: prisma.brand.update as jest.Mock,
  dailyBriefUpdate: prisma.dailyBrief.update as jest.Mock,
  postUpsert: prisma.post.upsert as jest.Mock,
  userDelete: prisma.user.delete as jest.Mock,
  userFindUnique: prisma.user.findUnique as jest.Mock,
  userUpsert: prisma.user.upsert as jest.Mock,
  weeklyBriefUpdate: prisma.weeklyBrief.update as jest.Mock,
};

const storagePutMock = jest.fn();

const sideEffectMocks: jest.Mock[] = [
  ...Object.values(dbMocks),
  triggerJobMock,
  clearSampleDataMock,
  loadSampleDataMock,
  checkStorageMock,
  getStorageMock,
  storagePutMock,
  makeThumbnailMock,
  saveInstanceSettingsMock,
  saveOfferCategoriesMock,
  savePullSettingsMock,
  getMentionsSettingsMock,
  saveMentionsSettingsMock,
  eraseMentionMock,
  classifierModeMock,
  resolveMentionRefMock,
  revalidatePathMock,
  redirectMock,
];

function form(entries: Record<string, string | Blob> = {}): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(entries)) {
    if (typeof value === "string") formData.append(name, value);
    else formData.append(name, value);
  }
  return formData;
}

type ActionCase = {
  name: string;
  invoke: () => Promise<unknown>;
};

const ACTIONS: readonly ActionCase[] = [
  { name: "intel/runNow", invoke: () => runNow(form({ job: "daily-brief" })) },
  { name: "intel/testStorage", invoke: () => testStorage() },
  { name: "intel/loadSamples", invoke: () => loadSamples() },
  { name: "intel/clearSamples", invoke: () => clearSamples() },
  {
    name: "brands/createBrand",
    invoke: () => createBrand(form({ nameEn: "Acme", type: "competitor" })),
  },
  {
    name: "brands/saveBrand",
    invoke: () => saveBrand(form({ id: "brand-1", nameEn: "Acme" })),
  },
  {
    name: "brands/toggleBrand",
    invoke: () => toggleBrand(form({ id: "brand-1" })),
  },
  { name: "brands/resolveNow", invoke: () => resolveNow() },
  {
    name: "brief/save",
    invoke: () => saveDaily(form({ id: "daily-1", en: "English", ar: "Arabic" })),
  },
  { name: "brief/regenerate", invoke: () => regenerateDaily() },
  {
    name: "weekly-brief/save",
    invoke: () => saveWeekly(form({ id: "weekly-1", en: "English", ar: "Arabic" })),
  },
  { name: "weekly-brief/regenerate", invoke: () => regenerateWeekly() },
  {
    name: "log-ad/logAd",
    invoke: () =>
      logAd(
        form({
          brandId: "brand-1",
          platform: "x",
          screenshot: new File(["image"], "ad.png", { type: "image/png" }),
        })
      ),
  },
  {
    name: "quick-add-post/addPost",
    invoke: () =>
      addPost(form({ brandId: "brand-1", url: "https://example.com/post" })),
  },
  {
    name: "settings/saveOffers",
    invoke: () => saveOffers(form({ categories: "Offer: sale, deal" })),
  },
  {
    name: "settings/saveInstance",
    invoke: () =>
      saveInstance(
        form({
          customerNameEn: "Acme",
          customerNameAr: "Acme AR",
          marketRegion: "sa",
          defaultLang: "ar",
        })
      ),
  },
  {
    name: "settings/save",
    invoke: () =>
      savePull(form({ xHours_on: "1", xHours_hours: "12" })),
  },
  {
    name: "users/addUser",
    invoke: () => addUser(form({ email: "new@example.com", role: "viewer" })),
  },
  {
    name: "users/removeUser",
    invoke: () => removeUser(form({ id: "user-2" })),
  },
  {
    name: "mentions/saveMentionSettings",
    invoke: () =>
      saveMentionSettings(
        form({
          enabled: "1",
          "terms_brand-1": "Acme, @acme,acme, Acme Bank",
          mediaHandles: "@Argaam, spagov, argaam",
        })
      ),
  },
  { name: "mentions/pullNow", invoke: () => pullNow() },
  {
    name: "mentions/removeMention",
    invoke: () => removeMention(form({ id: "mention-1" })),
  },
];

beforeEach(() => {
  authMock.mockReset();
  for (const mock of sideEffectMocks) mock.mockReset();

  dbMocks.brandCount.mockResolvedValue(0);
  dbMocks.brandFindUniqueOrThrow.mockResolvedValue({
    id: "brand-1",
    active: true,
    type: "competitor",
  });
  dbMocks.userFindUnique.mockResolvedValue({
    id: "user-2",
    email: "other@example.com",
  });
  checkStorageMock.mockResolvedValue({
    ok: true,
    kind: "local",
    target: "test-media",
    detail: "write, read and delete all succeeded",
  });
  getStorageMock.mockReturnValue({ put: storagePutMock });
  makeThumbnailMock.mockResolvedValue(null);
  triggerJobMock.mockResolvedValue({ status: "success", itemsIngested: 0, errors: [] });
  getMentionsSettingsMock.mockResolvedValue({ enabled: true, terms: {}, mediaHandles: [] });
  classifierModeMock.mockReturnValue("off");
  resolveMentionRefMock.mockResolvedValue("mention-9");
});

describe.each([
  ["anonymous", null],
  ["viewer", { user: { email: "viewer@example.com", role: "viewer" } }],
])("admin actions as %s", (_principal, session) => {
  test.each(ACTIONS)("$name rejects before every side effect", async ({ invoke }) => {
    authMock.mockResolvedValue(session);

    await expect(invoke()).rejects.toThrow("forbidden");

    expect(authMock).toHaveBeenCalledTimes(1);
    for (const sideEffect of sideEffectMocks) {
      expect(sideEffect).not.toHaveBeenCalled();
    }
  });
});

type PositiveCase = ActionCase & {
  verify: () => void;
};

const POSITIVE_CASES: readonly PositiveCase[] = [
  {
    ...ACTIONS[0],
    verify: () => expect(triggerJobMock).toHaveBeenCalledWith("daily-brief"),
  },
  {
    ...ACTIONS[1],
    verify: () => expect(checkStorageMock).toHaveBeenCalledTimes(1),
  },
  {
    ...ACTIONS[2],
    verify: () => {
      expect(loadSampleDataMock).toHaveBeenCalledTimes(1);
      expect(triggerJobMock.mock.calls).toEqual([
        ["weekly-brief"],
        ["brief-auto-publish"],
      ]);
    },
  },
  {
    ...ACTIONS[3],
    verify: () => expect(clearSampleDataMock).toHaveBeenCalledTimes(1),
  },
  {
    ...ACTIONS[4],
    verify: () => expect(dbMocks.brandCreate).toHaveBeenCalledTimes(1),
  },
  {
    ...ACTIONS[5],
    verify: () => expect(dbMocks.brandUpdate).toHaveBeenCalledTimes(1),
  },
  {
    ...ACTIONS[6],
    verify: () => {
      expect(dbMocks.brandFindUniqueOrThrow).toHaveBeenCalledTimes(1);
      expect(dbMocks.brandUpdate).toHaveBeenCalledTimes(1);
    },
  },
  {
    ...ACTIONS[7],
    verify: () => expect(triggerJobMock).toHaveBeenCalledWith("resolve-identities"),
  },
  {
    ...ACTIONS[8],
    verify: () => expect(dbMocks.dailyBriefUpdate).toHaveBeenCalledTimes(1),
  },
  {
    ...ACTIONS[9],
    verify: () => expect(triggerJobMock).toHaveBeenCalledWith("daily-brief"),
  },
  {
    ...ACTIONS[10],
    verify: () => expect(dbMocks.weeklyBriefUpdate).toHaveBeenCalledTimes(1),
  },
  {
    ...ACTIONS[11],
    verify: () => expect(triggerJobMock).toHaveBeenCalledWith("weekly-brief"),
  },
  {
    ...ACTIONS[12],
    verify: () => {
      expect(storagePutMock).toHaveBeenCalledTimes(1);
      expect(dbMocks.adCreate).toHaveBeenCalledTimes(1);
    },
  },
  {
    ...ACTIONS[13],
    verify: () => expect(dbMocks.postUpsert).toHaveBeenCalledTimes(1),
  },
  {
    ...ACTIONS[14],
    verify: () => expect(saveOfferCategoriesMock).toHaveBeenCalledWith([
      { label: "Offer", keywords: ["sale", "deal"] },
    ]),
  },
  {
    ...ACTIONS[15],
    verify: () => expect(saveInstanceSettingsMock).toHaveBeenCalledWith({
      customerNameEn: "Acme",
      customerNameAr: "Acme AR",
      marketRegion: "SA",
      defaultLang: "ar",
    }),
  },
  {
    ...ACTIONS[16],
    verify: () => expect(savePullSettingsMock).toHaveBeenCalledWith({
      xHours: 12,
      linkedinHours: 0,
      metaHours: 0,
      googleHours: 0,
      linkedinAdsHours: 0,
      tiktokHours: 0,
    }),
  },
  {
    ...ACTIONS[17],
    verify: () => expect(dbMocks.userUpsert).toHaveBeenCalledTimes(1),
  },
  {
    ...ACTIONS[18],
    verify: () => {
      expect(dbMocks.userFindUnique).toHaveBeenCalledTimes(1);
      expect(dbMocks.userDelete).toHaveBeenCalledWith({ where: { id: "user-2" } });
    },
  },
  {
    ...ACTIONS[19],
    verify: () => {
      // Terms are split, trimmed and deduped case-insensitively; handles
      // lose their "@" and are lowercased; nothing is defaulted.
      expect(saveMentionsSettingsMock).toHaveBeenCalledWith({
        enabled: true,
        terms: { "brand-1": ["Acme", "@acme", "Acme Bank"] },
        mediaHandles: ["argaam", "spagov"],
      });
      expect(revalidatePathMock.mock.calls.map((c) => c[0])).toEqual([
        "/intel/mentions",
        "/mentions",
        "/",
      ]);
    },
  },
  {
    ...ACTIONS[20],
    verify: () => {
      // Classifier off: only the poll runs, and the outcome is fed back
      // through an encoded ?run=ok:… redirect.
      expect(triggerJobMock.mock.calls).toEqual([["mentions-poll"]]);
      expect(redirectMock).toHaveBeenCalledTimes(1);
      expect(redirectMock.mock.calls[0][0]).toBe(
        `/intel/mentions?run=${encodeURIComponent("ok:0 new posts, 0 labelled (success)")}`
      );
    },
  },
  {
    ...ACTIONS[21],
    verify: () => {
      expect(resolveMentionRefMock).not.toHaveBeenCalled();
      expect(eraseMentionMock).toHaveBeenCalledWith("mention-1", "removed");
      expect(redirectMock).not.toHaveBeenCalled();
    },
  },
];

describe("admin action positive controls", () => {
  test.each(POSITIVE_CASES)("$name reaches its operation", async ({ invoke, verify }) => {
    authMock.mockResolvedValue({
      user: { email: "admin@example.com", role: "admin" },
    });

    await invoke();

    expect(authMock).toHaveBeenCalledTimes(1);
    verify();
  });
});

describe("mentions admin actions", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({
      user: { email: "admin@example.com", role: "admin" },
    });
  });

  test("pullNow with tracking switched off never reaches triggerJob", async () => {
    getMentionsSettingsMock.mockResolvedValue({ enabled: false, terms: {}, mediaHandles: [] });

    await pullNow();

    expect(triggerJobMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock.mock.calls[0][0]).toBe(
      `/intel/mentions?run=${encodeURIComponent("no:switch tracking on first")}`
    );
  });

  test("pullNow runs mentions-classify only when the classifier is configured", async () => {
    classifierModeMock.mockReturnValue("on");
    triggerJobMock
      .mockResolvedValueOnce({ status: "success", itemsIngested: 12, errors: [] })
      .mockResolvedValueOnce({ status: "success", itemsIngested: 7, errors: [] });

    await pullNow();

    expect(triggerJobMock.mock.calls).toEqual([["mentions-poll"], ["mentions-classify"]]);
    expect(redirectMock.mock.calls[0][0]).toBe(
      `/intel/mentions?run=${encodeURIComponent("ok:12 new posts, 7 labelled (success)")}`
    );
  });

  test("pullNow reports a stopped or failed poll with its first non-info error, encoded", async () => {
    triggerJobMock.mockResolvedValueOnce({
      status: "stopped_budget",
      itemsIngested: 0,
      errors: ["(info) Acme: no search terms — skipped", 'Monthly ceiling for "mentions" & more #1'],
    });

    await pullNow();

    expect(triggerJobMock.mock.calls).toEqual([["mentions-poll"]]);
    const target = redirectMock.mock.calls[0][0] as string;
    expect(target).toBe(
      `/intel/mentions?run=${encodeURIComponent('no:Monthly ceiling for "mentions" & more #1')}`
    );
    expect(target).not.toContain("#1");
  });

  test("pullNow falls back to the status when a skipped run carries only info lines", async () => {
    triggerJobMock.mockResolvedValueOnce({
      status: "skipped_entitlement",
      itemsIngested: 0,
      errors: ['(info) feature "mentions" is not included in this instance\'s license (LICENSE_FEATURES) — skipped'],
    });

    await pullNow();

    expect(redirectMock.mock.calls[0][0]).toBe(
      `/intel/mentions?run=${encodeURIComponent("no:skipped_entitlement")}`
    );
  });

  test("removeMention by X link resolves the reference before erasing", async () => {
    await removeMention(form({ ref: "https://x.com/someone/status/123" }));

    expect(resolveMentionRefMock).toHaveBeenCalledWith("https://x.com/someone/status/123");
    expect(eraseMentionMock).toHaveBeenCalledWith("mention-9", "removed");
    expect(redirectMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledTimes(3);
  });

  test("removeMention with an unknown link erases nothing and reports it", async () => {
    resolveMentionRefMock.mockResolvedValue(null);

    await removeMention(form({ ref: "https://x.com/someone/status/999" }));

    expect(eraseMentionMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(redirectMock.mock.calls[0][0]).toBe(
      `/intel/mentions?run=${encodeURIComponent("no:no stored post matches that link")}`
    );
  });

  test("saveMentionSettings caps terms at eight of sixty characters and stores the switch off", async () => {
    const terms = Array.from({ length: 10 }, (_, i) => `term-${i}-${"x".repeat(70)}`).join("\n");

    await saveMentionSettings(form({ "terms_brand-1": terms, mediaHandles: "" }));

    const saved = saveMentionsSettingsMock.mock.calls[0][0];
    expect(saved.enabled).toBe(false);
    expect(saved.terms["brand-1"]).toHaveLength(8);
    for (const t of saved.terms["brand-1"]) expect(t.length).toBeLessThanOrEqual(60);
    expect(saved.mediaHandles).toEqual([]);
  });
});
