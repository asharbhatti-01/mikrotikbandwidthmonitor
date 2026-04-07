"use client";

import { useState, type FormEvent } from "react";
import { Building2, Globe, Users, UserPlus, Trash2, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

const ROLES = ["admin", "operator", "viewer"] as const;

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-[oklch(22%_0.012_250)] pb-4">
      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-[oklch(46%_0.19_250)/0.15]">
        <Icon className="h-4 w-4 text-[oklch(54%_0.18_250)]" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-[oklch(85%_0.006_250)]">{title}</h2>
        <p className="text-xs text-[oklch(50%_0.006_250)]">{description}</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { data: org, isLoading: orgLoading } = trpc.orgs.getCurrent.useQuery();
  const { data: membersData, isLoading: membersLoading } =
    trpc.orgs.listMembers.useQuery();
  const utils = trpc.useUtils();

  const [orgName, setOrgName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Pre-fill form when org loads
  useState(() => {
    if (org) {
      setOrgName(org.name ?? "");
      setTimezone(org.timezone ?? "UTC");
    }
  });

  const updateOrg = trpc.orgs.update.useMutation({
    onSuccess() {
      void utils.orgs.getCurrent.invalidate();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "operator" | "viewer">(
    "operator"
  );

  const inviteMember = trpc.orgs.inviteMember.useMutation({
    onSuccess() {
      void utils.orgs.listMembers.invalidate();
      setInviteEmail("");
    },
  });

  const removeMember = trpc.orgs.removeMember.useMutation({
    onSuccess: () => void utils.orgs.listMembers.invalidate(),
  });

  function handleSaveOrg(e: FormEvent) {
    e.preventDefault();
    updateOrg.mutate({ name: orgName || undefined, timezone: timezone || undefined });
  }

  function handleInvite(e: FormEvent) {
    e.preventDefault();
    inviteMember.mutate({ email: inviteEmail, role: inviteRole });
  }

  const members = membersData?.members ?? [];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[oklch(92%_0.006_250)]">Settings</h1>
        <p className="mt-0.5 text-sm text-[oklch(55%_0.006_250)]">
          Manage your organisation profile and team.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Org profile */}
          <div className="rounded-xl border border-[oklch(22%_0.012_250)] bg-[oklch(16%_0.01_250)] p-6">
            <SectionHeader
              icon={Building2}
              title="Organisation profile"
              description="Update your organisation name and preferences."
            />
            {orgLoading ? (
              <div className="mt-4 h-24 animate-pulse rounded-lg bg-[oklch(20%_0.012_250)]" />
            ) : (
              <form onSubmit={handleSaveOrg} className="mt-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="org-name" className="text-sm font-medium text-[oklch(80%_0.006_250)]">
                    Organisation name
                  </label>
                  <input
                    id="org-name"
                    type="text"
                    value={orgName || (org?.name ?? "")}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Acme Corp"
                    className="rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-3 py-2 text-sm text-[oklch(92%_0.006_250)] placeholder:text-[oklch(45%_0.006_250)] outline-none focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="timezone" className="flex items-center gap-1.5 text-sm font-medium text-[oklch(80%_0.006_250)]">
                    <Globe className="h-3.5 w-3.5" />
                    Timezone
                  </label>
                  <select
                    id="timezone"
                    value={timezone || (org?.timezone ?? "UTC")}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-3 py-2 text-sm text-[oklch(92%_0.006_250)] outline-none focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25]"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-3">
                  {updateOrg.error && (
                    <p className="text-xs text-[oklch(70%_0.16_25)]">{updateOrg.error.message}</p>
                  )}
                  <button
                    type="submit"
                    disabled={updateOrg.isPending}
                    className="flex items-center gap-2 rounded-lg bg-[oklch(46%_0.19_250)] px-4 py-2 text-sm font-medium text-white hover:bg-[oklch(54%_0.18_250)] disabled:opacity-50"
                  >
                    {saveSuccess ? (
                      <>
                        <Check className="h-4 w-4" />
                        Saved
                      </>
                    ) : updateOrg.isPending ? (
                      "Saving…"
                    ) : (
                      "Save changes"
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Team members */}
          <div className="rounded-xl border border-[oklch(22%_0.012_250)] bg-[oklch(16%_0.01_250)] p-6">
            <SectionHeader
              icon={Users}
              title="Team members"
              description="Invite teammates and manage their access."
            />

            {/* Invite form */}
            <form onSubmit={handleInvite} className="mt-4 flex gap-2">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="flex-1 rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-3 py-2 text-sm text-[oklch(92%_0.006_250)] placeholder:text-[oklch(45%_0.006_250)] outline-none focus:border-[oklch(54%_0.18_250)] focus:ring-2 focus:ring-[oklch(54%_0.18_250)/0.25]"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                className="rounded-lg border border-[oklch(25%_0.013_250)] bg-[oklch(20%_0.012_250)] px-3 py-2 text-sm text-[oklch(92%_0.006_250)] outline-none focus:border-[oklch(54%_0.18_250)]"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} className="capitalize">{r}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={inviteMember.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-[oklch(46%_0.19_250)] px-3 py-2 text-sm font-medium text-white hover:bg-[oklch(54%_0.18_250)] disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                Invite
              </button>
            </form>

            {/* Members list */}
            <div className="mt-4">
              {membersLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-lg bg-[oklch(20%_0.012_250)]" />
                  ))}
                </div>
              ) : members.length === 0 ? (
                <p className="py-4 text-center text-sm text-[oklch(50%_0.006_250)]">
                  No members yet.
                </p>
              ) : (
                <ul className="divide-y divide-[oklch(20%_0.012_250)] rounded-lg border border-[oklch(22%_0.012_250)]">
                  {members.map((member) => (
                    <li key={member.userId} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[oklch(46%_0.19_250)/0.2] text-xs font-semibold text-[oklch(65%_0.14_250)]">
                          {(member.name ?? member.email ?? "?")[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[oklch(85%_0.006_250)]">
                            {member.name ?? member.email}
                          </p>
                          {member.name && (
                            <p className="truncate text-xs text-[oklch(50%_0.006_250)]">{member.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded-full border border-[oklch(25%_0.013_250)] px-2 py-0.5 text-xs capitalize text-[oklch(60%_0.006_250)]">
                          {member.role}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${member.email}`}
                          onClick={() => removeMember.mutate({ userId: member.userId })}
                          className="text-[oklch(45%_0.006_250)] transition hover:text-[oklch(70%_0.16_25)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Right column — org info card */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-[oklch(22%_0.012_250)] bg-[oklch(16%_0.01_250)] p-5">
            <h3 className="mb-3 text-sm font-semibold text-[oklch(75%_0.006_250)]">
              Organisation details
            </h3>
            {orgLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-5 animate-pulse rounded bg-[oklch(20%_0.012_250)]" />
                ))}
              </div>
            ) : (
              <dl className="flex flex-col gap-2.5">
                {[
                  { dt: "Name", dd: org?.name ?? "—" },
                  { dt: "Slug", dd: org?.slug ?? "—" },
                  { dt: "Timezone", dd: org?.timezone ?? "UTC" },
                  {
                    dt: "Created",
                    dd: org?.createdAt
                      ? new Date(org.createdAt).toLocaleDateString()
                      : "—",
                  },
                ].map(({ dt, dd }) => (
                  <div key={dt} className="flex items-start justify-between gap-2">
                    <dt className="text-xs text-[oklch(50%_0.006_250)]">{dt}</dt>
                    <dd className="text-right text-xs font-medium text-[oklch(75%_0.006_250)]">
                      {dd}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
