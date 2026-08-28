import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiJson, toFieldErrors } from "../lib/api";
import type { Paginated } from "../lib/types";

interface Address {
  id: number;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
}

const EMPTY_FORM = { name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" };
const FIELDS: Array<[keyof typeof EMPTY_FORM, string]> = [
  ["name", "Full name"],
  ["phone", "Phone"],
  ["line1", "Address line 1"],
  ["line2", "Address line 2 (optional)"],
  ["city", "City"],
  ["state", "State"],
  ["pincode", "Pincode"],
];

export function Addresses() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

  const load = () => { // loading isn't reset on reload — the swap-in is fast, no spinner needed there
    apiJson<Paginated<Address> | Address[]>("/api/auth/addresses/")
      .then((data) => setAddresses("results" in data ? data.results : data))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  function startAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setShowForm(true);
  }

  function startEdit(address: Address) {
    setEditingId(address.id);
    setForm({
      name: address.name,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
    });
    setFieldErrors({});
    setShowForm(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setSubmitting(true);
    try {
      if (editingId) {
        await apiJson(`/api/auth/addresses/${editingId}/`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await apiJson("/api/auth/addresses/", { method: "POST", body: JSON.stringify(form) });
      }
      setShowForm(false);
      load();
    } catch (err) {
      setFieldErrors(toFieldErrors(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function setDefault(id: number) {
    try {
      await apiJson(`/api/auth/addresses/${id}/`, { method: "PATCH", body: JSON.stringify({ is_default: true }) });
      load();
    } catch (err) {
      setFieldErrors(toFieldErrors(err));
    }
  }

  async function remove(id: number) {
    try {
      await apiJson(`/api/auth/addresses/${id}/`, { method: "DELETE" });
      setConfirmingDelete(null);
      load();
    } catch (err) {
      setFieldErrors(toFieldErrors(err));
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <Link to="/profile" className="text-sm text-neutral-500 hover:underline">
        ← Back to profile
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-8">Your Addresses</h1>

      {loading && <p className="text-sm text-neutral-500">Loading…</p>}

      {!loading && addresses.length === 0 && !showForm && (
        <p className="text-sm text-neutral-500 mb-6">No addresses saved yet.</p>
      )}

      <div className="flex flex-col gap-4 mb-6">
        {addresses.map((a) => (
          <div key={a.id} className="border border-neutral-200 rounded-md p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold flex items-center gap-2">
                  {a.name}
                  {a.is_default && (
                    <span className="text-xs uppercase bg-neutral-900 text-white rounded-full px-2 py-0.5">
                      Default
                    </span>
                  )}
                </p>
                <p className="text-sm text-neutral-600 mt-1">
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ""}
                </p>
                <p className="text-sm text-neutral-600">
                  {a.city}, {a.state} {a.pincode}
                </p>
                <p className="text-sm text-neutral-500 mt-1">{a.phone}</p>
              </div>
              <div className="flex flex-col items-end gap-2 text-sm">
                <button onClick={() => startEdit(a)} className="text-neutral-700 hover:underline">
                  Edit
                </button>
                {!a.is_default && (
                  <button onClick={() => setDefault(a.id)} className="text-neutral-700 hover:underline">
                    Set as default
                  </button>
                )}
                {confirmingDelete === a.id ? (
                  <div className="flex gap-2">
                    <button onClick={() => remove(a.id)} className="text-red-600 hover:underline">
                      Confirm
                    </button>
                    <button onClick={() => setConfirmingDelete(null)} className="text-neutral-500 hover:underline">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmingDelete(a.id)} className="text-red-600 hover:underline">
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!showForm && (
        <button onClick={startAdd} className="bg-neutral-900 text-white rounded-md py-2 px-4 text-sm">
          + Add a new address
        </button>
      )}

      {showForm && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4 border-t border-neutral-200 pt-6">
          <h2 className="text-lg font-semibold">{editingId ? "Edit address" : "Add address"}</h2>
          {FIELDS.map(([key, label]) => (
            <div key={key}>
              <label className="text-xs font-semibold uppercase text-neutral-500">{label}</label>
              <input
                required={key !== "line2"}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="mt-1 w-full border border-neutral-300 rounded-md px-3 py-2"
              />
              {fieldErrors[key] && <p className="text-sm text-red-600 mt-1">{fieldErrors[key]}</p>}
            </div>
          ))}
          {fieldErrors.non_field && <p className="text-sm text-red-600">{fieldErrors.non_field}</p>}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="bg-neutral-900 text-white rounded-md py-2 px-4 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Save address"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-neutral-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
