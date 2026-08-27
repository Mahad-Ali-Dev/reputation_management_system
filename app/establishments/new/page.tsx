import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { createEstablishment } from "@/lib/establishments/actions";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { Icon, type IconName } from "@/components/shell/icon";
import "../establishments.css";

/**
 * Add New Business — wizard Step 1 "Details" (module 14). Left: the business
 * details form (posts the real `createEstablishment` action, which redirects to
 * the new establishment's detail page = Step 2 "Verify"). Right: a violet promo
 * panel with the kit illustration + 3 feature callouts.
 *
 * Steps 2–4 (Verify / Connect / Launch) happen after create — Connect is Google
 * OAuth from the new establishment's row / the /connections hub — so the stepper
 * is a visual guide with Step 1 active.
 */

const STEPS = [
  {
    n: 1,
    title: "Details",
    sub: "Name, category, address",
    tint: "violet",
    icon: "/assets/repulabs/establishments/step-details.svg",
  },
  {
    n: 2,
    title: "Verify",
    sub: "Confirm the profile",
    tint: "green",
    icon: "/assets/repulabs/establishments/step-verify.svg",
  },
  {
    n: 3,
    title: "Connect",
    sub: "Google Business Profile",
    tint: "blue",
    icon: "/assets/repulabs/establishments/step-connect.svg",
  },
  {
    n: 4,
    title: "Launch",
    sub: "Reviews start syncing",
    tint: "amber",
    icon: "/assets/repulabs/establishments/step-launch.svg",
  },
] as const;

const FEATURES = [
  {
    title: "Collect reviews",
    desc: "Gather more happy customer reviews",
    tint: "blue",
    icon: "/assets/repulabs/establishments/feat-collect.svg",
  },
  {
    title: "Connect devices",
    desc: "Link your devices and manage from one place",
    tint: "green",
    icon: "/assets/repulabs/establishments/feat-connect.svg",
  },
  {
    title: "Get insights",
    desc: "Track performance and improve your reputation",
    tint: "pink",
    icon: "/assets/repulabs/establishments/feat-insight.svg",
  },
] as const;

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Add New Business · Repulabs",
};

export default async function NewEstablishmentPage() {
  await getOrgContext();

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "My Businesses"]}>
      <div className="est">
        <div className="est-toprow">
          <span className="est-hero__eyebrow">
            <Icon name="lock" size={12} style={{ marginRight: -2 }} />
            New Business
          </span>
          <Link href="/establishments" className="est-backlink">
            <Icon name="chevL" size={16} />
            Back to establishments
          </Link>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h1 className="est-hero__title">Add New Business</h1>
          <p className="est-hero__sub" style={{ maxWidth: 640 }}>
            A business you want to manage reviews for. You&apos;ll connect{" "}
            <strong style={{ color: "var(--est-body)", fontWeight: 600 }}>
              Google Business Profile
            </strong>{" "}
            in the next step.
          </p>
        </div>

        {/* Stepper — Step 1 active (module 14 §4). */}
        <ol className="est-stepper" aria-label="Add business steps">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className={`est-step${i === 0 ? " est-step--active" : ""}`}
              aria-current={i === 0 ? "step" : undefined}
            >
              <span className={`est-step__badge est-step__badge--${s.tint}`} aria-hidden="true">
                {/* biome-ignore lint/performance/noImgElement: static kit SVG glyph */}
                <img src={s.icon} alt="" width={26} height={26} />
                <span className="est-step__num">{s.n}</span>
              </span>
              <span className="est-step__txt">
                <span className="est-step__title">{s.title}</span>
                <span className="est-step__sub">{s.sub}</span>
              </span>
              {i < STEPS.length - 1 && <span className="est-step__line" aria-hidden="true" />}
            </li>
          ))}
        </ol>

        <div className="est-wizard">
          {/* Left — details form (real create action). */}
          <form action={createEstablishment} className="est-form">
            <h2 className="est-form__title">Business details</h2>
            <p className="est-form__sub">Tell us about the place you manage.</p>

            <Field
              label="Name"
              name="name"
              required
              icon="building"
              placeholder="Acme Coffee Downtown"
            />

            <SelectField
              label="Category"
              name="category"
              icon="tag"
              placeholder="cafe / dental / salon / ..."
              options={[
                "Cafe",
                "Restaurant",
                "Retail",
                "Dental",
                "Salon",
                "Fitness",
                "Automotive",
                "IT Services",
                "Professional Services",
                "Other",
              ]}
            />

            <SelectField
              label="Timezone"
              name="timezone"
              icon="clock"
              defaultValue="UTC"
              options={[
                "UTC",
                "America/New_York",
                "America/Chicago",
                "America/Denver",
                "America/Los_Angeles",
                "Europe/London",
                "Europe/Paris",
                "Asia/Karachi",
                "Asia/Dubai",
                "Asia/Singapore",
                "Australia/Sydney",
              ]}
            />

            <div className="est-field">
              <span className="est-field__lbl">
                Address <span style={{ color: "var(--est-muted-2)", fontWeight: 400 }}>· Street</span>
              </span>
              <InputBase name="address_line1" icon="pin" placeholder="123 Main St" />
            </div>

            <div className="est-grid2">
              <Field label="City" name="address_city" icon="building" />
              <Field label="Region / State" name="address_region" icon="globe" />
            </div>

            <div className="est-grid2">
              <Field label="Postal code" name="address_postal" icon="mail" />
              <SelectField
                label="Country"
                name="address_country"
                icon="globe"
                placeholder="US or United States"
                options={[
                  "United States",
                  "Canada",
                  "United Kingdom",
                  "Australia",
                  "Pakistan",
                  "United Arab Emirates",
                  "Singapore",
                  "Germany",
                  "France",
                  "Other",
                ]}
              />
            </div>

            <div className="est-form__actions">
              <button type="submit" className="est-btn est-btn--pri">
                <Icon name="plus" size={16} />
                Create
              </button>
              <Link href="/establishments" className="est-btn est-btn--ghost">
                Cancel
              </Link>
            </div>
          </form>

          {/* Right — promo panel. */}
          <aside className="est-promo">
            {/* biome-ignore lint/performance/noImgElement: static decorative kit SVG */}
            <img
              src="/assets/repulabs/establishments/wizard-hero.svg"
              alt=""
              aria-hidden="true"
              className="est-promo__art"
              width={480}
              height={252}
            />
            <h2 className="est-promo__title">Let&apos;s grow your business</h2>
            <p className="est-promo__sub">
              Add your business to start collecting reviews, connect devices, and unlock powerful
              insights.
            </p>
            <ul
              className="est-features"
              style={{ listStyle: "none", margin: 0, padding: 0 }}
            >
              {FEATURES.map((f) => (
                <li key={f.title} className="est-feature">
                  <span className={`est-feature__icon est-feature__icon--${f.tint}`} aria-hidden="true">
                    {/* biome-ignore lint/performance/noImgElement: static kit SVG glyph */}
                    <img src={f.icon} alt="" width={40} height={40} />
                  </span>
                  <div>
                    <div className="est-feature__title">{f.title}</div>
                    <div className="est-feature__desc">{f.desc}</div>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </AppShellServer>
  );
}

function InputBase({
  name,
  icon,
  placeholder,
  required,
  defaultValue,
}: {
  name: string;
  icon: IconName;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <span className="est-inputwrap">
      <span className="est-inputwrap__icon" aria-hidden="true">
        <Icon name={icon} size={16} />
      </span>
      <input
        type="text"
        name={name}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="est-input"
      />
    </span>
  );
}

function Field({
  label,
  name,
  icon,
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  icon: IconName;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="est-field">
      <span className="est-field__lbl">
        {label}
        {required && <span className="est-field__req"> *</span>}
      </span>
      <InputBase
        name={name}
        icon={icon}
        placeholder={placeholder}
        required={required}
        defaultValue={defaultValue}
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  icon,
  placeholder,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  icon: IconName;
  placeholder?: string;
  defaultValue?: string;
  options: readonly string[];
}) {
  return (
    <label className="est-field">
      <span className="est-field__lbl">{label}</span>
      <span className="est-inputwrap">
        <span className="est-inputwrap__icon" aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
        <select name={name} className="est-input" defaultValue={defaultValue ?? ""}>
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}
