import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { ApiError } from "../lib/api";

export function Profile() {
  const { user, updateProfile, deleteAccount } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [mobile, setMobile] = useState(user?.mobile ?? "");
  const [dob, setDob] = useState(user?.date_of_birth ?? "");
  const [gender, setGender] = useState(user?.gender ?? "other");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!user) return null; // <RequireAuth> guarantees this never renders unauthenticated

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setSaved(false);
    setSubmitting(true);
    try {
      await updateProfile({
        first_name: firstName,
        last_name: lastName,
        mobile,
        date_of_birth: dob,
        gender: gender as "male" | "female" | "other",
      });
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === "object") {
        const body = err.body as Record<string, string[] | string>;
        setFieldErrors(
          Object.fromEntries(
            Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? v.join(" ") : v]),
          ),
        );
      } else {
        setFieldErrors({ non_field: "Something went wrong. Please try again." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    try {
      await deleteAccount();
      navigate("/");
    } catch {
      setFieldErrors({ non_field: "Couldn't delete your account. Please try again." });
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-1">Your Profile</h1>
      <p className="text-sm text-neutral-500 mb-8">{user.email}</p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-xs font-semibold uppercase text-neutral-500">First Name</label>
            <input
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1 w-full border border-neutral-300 rounded-md px-3 py-2"
            />
            {fieldErrors.first_name && <p className="text-sm text-red-600 mt-1">{fieldErrors.first_name}</p>}
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold uppercase text-neutral-500">Last Name</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1 w-full border border-neutral-300 rounded-md px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase text-neutral-500">Date of Birth</label>
          <input
            type="date"
            required
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="mt-1 w-full border border-neutral-300 rounded-md px-3 py-2"
          />
          {fieldErrors.date_of_birth && <p className="text-sm text-red-600 mt-1">{fieldErrors.date_of_birth}</p>}
        </div>

        <div>
          <label className="text-xs font-semibold uppercase text-neutral-500">Mobile Number</label>
          <div className="mt-1 flex gap-2">
            <span className="px-3 py-2 border border-neutral-300 rounded-md text-neutral-500">+91</span>
            <input
              required
              inputMode="numeric"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className="flex-1 border border-neutral-300 rounded-md px-3 py-2"
            />
          </div>
          {fieldErrors.mobile && <p className="text-sm text-red-600 mt-1">{fieldErrors.mobile}</p>}
        </div>

        <fieldset>
          <legend className="text-xs font-semibold uppercase text-neutral-500 mb-2">Gender</legend>
          <div className="flex gap-4">
            {(["male", "female", "other"] as const).map((g) => (
              <label key={g} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="gender"
                  checked={gender === g}
                  onChange={() => setGender(g)}
                />
                {g[0].toUpperCase() + g.slice(1)}
              </label>
            ))}
          </div>
        </fieldset>

        {fieldErrors.non_field && <p className="text-sm text-red-600">{fieldErrors.non_field}</p>}
        {saved && <p className="text-sm text-green-700">Profile updated.</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 bg-neutral-900 text-white rounded-md py-2 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
      </form>

      <div className="mt-12 border-t border-neutral-200 pt-6">
        <p className="text-sm font-semibold text-neutral-700 mb-2">Delete account</p>
        <p className="text-sm text-neutral-500 mb-3">
          This deactivates your account and logs you out everywhere. This can't be undone
          from here.
        </p>
        {!confirmingDelete ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-sm text-red-600 hover:underline"
          >
            Delete my account
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={deleting}
              onClick={onDelete}
              className="text-sm bg-red-600 text-white rounded-md px-3 py-2 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Yes, delete my account"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmingDelete(false)}
              className="text-sm text-neutral-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
