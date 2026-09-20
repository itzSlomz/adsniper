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
  saveInstanceSettings: jest.fn(),
  saveOfferCategories: jest.fn(),
  savePullSettings: jest.fn(),
}));
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
import { prisma } from "@/lib/db";
import { clearSampleData, loadSampleData } from "@/lib/sampleData";
import { makeThumbnail } from "@/lib/sharpOptional";
import {
  saveInstanceSettings,
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
  triggerJobMock.mockResolvedValue({ status: "success", items: 0, errors: [] });
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
