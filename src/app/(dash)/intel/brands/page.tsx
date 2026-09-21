import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { Brand } from "@prisma/client";
import { createBrand, resolveNow, saveBrand, toggleBrand } from "./actions";
import { MAX_COMPETITORS } from "./constants";

export const dynamic = "force-dynamic";

// Brand setup — the core of MarketingSpy onboarding: the customer's own brand
// plus up to 8 competitors, all admin-managed here (no seeded market).
// Deactivating stops polling but keeps history; brands are never deleted.
export default async function BrandsPage(
  props: {
    searchParams: Promise<{ error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== "admin") redirect("/");

  const brands = await prisma.brand.findMany({
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  });
  const self = brands.find((b) => b.type === "self" && b.active);
  const competitors = brands.filter((b) => b.type === "competitor");
  const activeCompetitors = competitors.filter((b) => b.active);
  const lastResolve = await prisma.jobRun.findFirst({
    where: { job: "resolve-identities" },
    orderBy: { startedAt: "desc" },
  });
  const resolveLines = ((lastResolve?.errorsJson as string[]) ?? []).filter((l) =>
    l.startsWith("(info)")
  );

  const errorMsg =
    searchParams.error === "cap"
      ? `Competitor limit reached — your plan tracks up to ${MAX_COMPETITORS} competitors. Deactivate one to add another.`
      : searchParams.error === "self"
        ? "Your brand is already set up. Edit it below, or deactivate it first to replace it."
        : searchParams.error === "name"
          ? "Name (English) is required."
          : null;

  return (
    <main className="space-y-6">
      <div className="section-head">
        <span className="section-kicker">Admin</span>
        <h1 style={{ margin: 0, fontSize: 28 }}>Brands</h1>
      </div>
      <p className="text-sm text-muted">
        Your brand and up to {MAX_COMPETITORS} competitors. Handles and page
        URLs drive ingestion; advertiser IDs are what the ad libraries are
        actually queried by — fill them via{" "}
        <strong>Find advertiser IDs</strong> below (results need a quick
        review), or paste them manually.
      </p>
      {errorMsg && <div className="callout text-sm">{errorMsg}</div>}

      <section className="space-y-3">
        <h2 style={{ margin: 0, fontSize: 18 }}>Your brand</h2>
        {self ? (
          <BrandCard brand={self} saveAction={saveBrand} toggleAction={toggleBrand} />
        ) : (
          <NewBrandCard type="self" createAction={createBrand} />
        )}
      </section>

      <section className="space-y-3">
        <h2 style={{ margin: 0, fontSize: 18 }}>
          Competitors{" "}
          <span className="text-muted" style={{ fontSize: 13, fontWeight: 400 }}>
            {activeCompetitors.length}/{MAX_COMPETITORS} active
          </span>
        </h2>
        {competitors.map((b) => (
          <BrandCard key={b.id} brand={b} saveAction={saveBrand} toggleAction={toggleBrand} />
        ))}
        {activeCompetitors.length < MAX_COMPETITORS && (
          <NewBrandCard type="competitor" createAction={createBrand} />
        )}
      </section>

      <section className="card elev-sm space-y-3">
        <h2 style={{ margin: 0, fontSize: 16 }}>Advertiser identity resolution</h2>
        <p className="text-sm text-muted">
          Searches the Meta and Google ad libraries for each active brand
          (official Facebook page first, then name matching) and fills the
          advertiser IDs above. Costs a small amount of provider budget.
          Review the findings — name matching narrows candidates, it does
          not replace your judgement.
        </p>
        <form action={resolveNow}>
          <button className="btn btn-primary">Find advertiser IDs now</button>
        </form>
        {lastResolve && (
          <div className="text-xs text-muted space-y-1">
            <p>
              Last run {new Date(lastResolve.startedAt).toLocaleString()} —{" "}
              {lastResolve.status}
            </p>
            {resolveLines.map((l, i) => (
              <p key={i} style={{ fontFamily: "monospace" }}>
                {l.replace("(info) ", "")}
              </p>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-muted">
        <Link href="/intel" style={{ textDecoration: "underline" }}>
          ← Back to Intel
        </Link>
      </p>
    </main>
  );
}

function BrandFieldsInputs({ brand }: { brand?: Brand }) {
  const aliases = ((brand?.aliases as string[]) ?? []).join(", ");
  const metaIds = ((brand?.metaPageIds as string[]) ?? []).join(", ");
  const googleIds = ((brand?.googleAdvertiserIds as string[]) ?? []).join(", ");
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted">
          Name (English) *
          <input name="nameEn" defaultValue={brand?.nameEn ?? ""} required className="input" />
        </label>
        <label className="text-xs text-muted">
          Name (Arabic)
          <input name="nameAr" defaultValue={brand?.nameAr ?? ""} dir="rtl" className="input" />
        </label>
        <label className="text-xs text-muted">
          X handle (without @)
          <input name="xHandle" defaultValue={brand?.xHandle ?? ""} className="input" />
        </label>
        <label className="text-xs text-muted">
          LinkedIn page URL
          <input name="linkedinPageUrl" defaultValue={brand?.linkedinPageUrl ?? ""} className="input" />
        </label>
        <label className="text-xs text-muted">
          Facebook page URL (official — used to find Meta advertiser IDs)
          <input name="facebookPageUrl" defaultValue={brand?.facebookPageUrl ?? ""} className="input" />
        </label>
        <label className="text-xs text-muted">
          Brand color (hex)
          <input name="brandColor" defaultValue={brand?.brandColor ?? ""} placeholder="#3987E5" className="input" />
        </label>
      </div>
      <label className="text-xs text-muted" style={{ display: "block" }}>
        Matching aliases (comma-separated distinctive name fragments, EN/AR)
        <input name="aliases" defaultValue={aliases} className="input" />
      </label>
      <details className="text-xs text-muted">
        <summary style={{ cursor: "pointer" }}>Advertiser IDs (advanced)</summary>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">
            Meta page IDs (comma-separated)
            <input name="metaPageIds" defaultValue={metaIds} className="input" />
          </label>
          <label className="text-xs text-muted">
            Google advertiser IDs (comma-separated, AR…)
            <input name="googleAdvertiserIds" defaultValue={googleIds} className="input" />
          </label>
        </div>
      </details>
    </>
  );
}

function BrandCard({
  brand,
  saveAction,
  toggleAction,
}: {
  brand: Brand;
  saveAction: (formData: FormData) => Promise<void>;
  toggleAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="card elev-sm space-y-3" style={{ opacity: brand.active ? 1 : 0.6 }}>
      <div className="flex items-center justify-between">
        <strong>
          {brand.nameEn}
          {!brand.active && <span className="text-muted"> (inactive — not polled)</span>}
        </strong>
        <form action={toggleAction}>
          <input type="hidden" name="id" value={brand.id} />
          <button className="btn btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}>
            {brand.active ? "Deactivate" : "Reactivate"}
          </button>
        </form>
      </div>
      <form action={saveAction} className="space-y-3">
        <input type="hidden" name="id" value={brand.id} />
        <BrandFieldsInputs brand={brand} />
        <button className="btn btn-primary" style={{ fontSize: 13 }}>
          Save
        </button>
      </form>
    </div>
  );
}

function NewBrandCard({
  type,
  createAction,
}: {
  type: "self" | "competitor";
  createAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <details className="card elev-sm">
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>
        {type === "self" ? "＋ Set up your brand" : "＋ Add competitor"}
      </summary>
      <form action={createAction} className="mt-3 space-y-3">
        <input type="hidden" name="type" value={type} />
        <BrandFieldsInputs />
        <button className="btn btn-primary" style={{ fontSize: 13 }}>
          {type === "self" ? "Create your brand" : "Add competitor"}
        </button>
      </form>
    </details>
  );
}
