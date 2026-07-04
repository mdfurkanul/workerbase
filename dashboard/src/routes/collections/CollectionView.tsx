import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";
import CollectionHeader from "@/components/CollectionHeader";
import CollectionSettings from "@/components/CollectionSettings";
import SlideOver from "@/components/SlideOver";
import Modal from "@/components/Modal";
import { useCollections } from "@/hooks/useCollections";
import { useAuth, isAdmin, canEdit } from "@/hooks/useAuth";
import { type Collection } from "@/lib/mockData";
import { apiClient } from "@/lib/api-client";
import { collectionAllowsRecordEdits } from "./helpers";
import { RecordsTable } from "./RecordsTable";
import { EditPanel } from "./EditPanel";
import { NewRecordPanel } from "./NewRecordPanel";

/* ─── Single collection view (records + slide-over panels) ─────────── */
export function CollectionView({ name }: { name: string }) {
  const navigate = useNavigate();
  const { collections, loading, refresh } = useCollections();
  const { user } = useAuth();
  const collection = collections.find((c) => c.name === name);
  const [tick, setTick] = useState(0);
  const editSaveRef = useRef<(() => boolean | Promise<boolean | void>) | null>(null);
  const newRecordSaveRef = useRef<(() => void) | null>(null);
  const [params, setParams] = useSearchParams();
  const action = params.get("action");

  // Slide-over open state derived from the action query param.
  const slideOpen = action === "edit" || action === "settings" || action === "new";

  function closeSlide() {
    const next = new URLSearchParams(params);
    next.delete("action");
    setParams(next, { replace: true });
  }

  function openSlide(a: "edit" | "settings" | "new") {
    const next = new URLSearchParams(params);
    next.set("action", a);
    setParams(next, { replace: true });
  }

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiClient.del(`/api/core/collections/${encodeURIComponent(name)}`);
    } catch {
      // ignore — the refresh below will reflect the true DB state
    } finally {
      void refresh();
      navigate("/collections");
      setDeleting(false);
      setDeleteOpen(false);
      setDeleteTyped("");
    }
  }

  if (loading) {
    return (
      <AppShell>
        <PageHeader breadcrumbs={["Collections", name]} />
        <div className="px-6 py-16 text-center text-ink-muted text-[13px]">
          Loading collection…
        </div>
      </AppShell>
    );
  }

  if (!collection) {
    return (
      <AppShell>
        <PageHeader breadcrumbs={["Collections", name]} />
        <div className="px-6 py-16 text-center text-ink-muted">
          Collection <span className="font-mono text-ink">{name}</span> was not found.
        </div>
      </AppShell>
    );
  }

  function reload() {
    void refresh();
    setTick((t) => t + 1);
  }

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[<Link to="/collections" className="hover:text-ink">Collections</Link>, <span className="font-mono">{name}</span>]}
        actions={
          collection.name === "_superusers" && isAdmin(user) ? (
            <Link to="/users" className="btn-primary text-[12px]">
              <Plus size={13} /> Add user
            </Link>
          ) : undefined
        }
      />
      <CollectionHeader
        name={collection.name}
        type={collection.type}
        count={collection.count}
        onReload={reload}
        reloading={loading}
        onEdit={!collection.source || collection.source !== "system" && isAdmin(user) ? () => openSlide("edit") : undefined}
        onSettings={!collection.source || collection.source !== "system" && isAdmin(user) ? () => openSlide("settings") : undefined}
        onDelete={
          isAdmin(user) && collection.source !== "system"
            ? () => setDeleteOpen(true)
            : undefined
        }
      />
      <RecordsTable
        key={tick}
        collectionName={collection.name}
        schema={collection.schema}
        collectionType={collection.type}
        onNewRecord={
          canEdit(user) && collectionAllowsRecordEdits(collection.name, collection.type)
            ? () => openSlide("new")
            : undefined
        }
      />

      {/* Slide-over panels */}
      <SlideOver
        open={slideOpen && action === "edit"}
        title="Edit collection"
        subtitle={collection.name}
        onClose={closeSlide}
        footer={
          <>
            <button onClick={closeSlide} className="btn-ghost">Cancel</button>
            <button
              onClick={async () => {
                const ok = await editSaveRef.current?.();
                if (ok !== false) closeSlide();
              }}
              className="btn-primary"
            >
              Save changes
            </button>
          </>
        }
      >
        <EditPanel
          key={collection.id}
          collection={collection}
          onSaved={reload}
          registerSave={(fn) => { editSaveRef.current = fn; }}
        />
      </SlideOver>

      <SlideOver
        open={slideOpen && action === "settings"}
        title="Collection settings"
        subtitle={collection.name}
        onClose={closeSlide}
      >
        <CollectionSettings collectionName={collection.name} />
      </SlideOver>

      <SlideOver
        open={slideOpen && action === "new"}
        title="New record"
        subtitle={collection.name}
        onClose={closeSlide}
        footer={
          <>
            <button onClick={closeSlide} className="btn-ghost">Cancel</button>
            <button
              onClick={() => newRecordSaveRef.current?.()}
              className="btn-primary"
            >
              <Plus size={14} /> Create record
            </button>
          </>
        }
      >
        <NewRecordPanel
          schema={collection.schema}
          collectionName={collection.name}
          collectionType={collection.type}
          onCreated={() => { reload(); closeSlide(); }}
          registerSave={(fn) => { newRecordSaveRef.current = fn; }}
        />
      </SlideOver>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteOpen}
        title={<>Delete <span className="font-mono">{name}</span>?</>}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteTyped("");
        }}
        footer={
          <>
            <button
              onClick={() => {
                setDeleteOpen(false);
                setDeleteTyped("");
              }}
              className="btn-ghost"
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteTyped !== name || deleting}
              className="btn-primary disabled:opacity-50"
              style={{ background: "var(--err)", color: "#fff" }}
            >
              <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete forever"}
            </button>
          </>
        }
      >
        <p>
          This will permanently delete the collection{" "}
          <span className="font-mono text-ink">{name}</span>, its D1 table, and all records.
          This action cannot be undone.
        </p>
        <p className="mt-3">
          To confirm, type the collection name below.
        </p>
        <input
          value={deleteTyped}
          onChange={(e) => setDeleteTyped(e.target.value)}
          placeholder={name}
          className="field-input mt-2 font-mono"
          autoFocus
        />
      </Modal>
    </AppShell>
  );
}
