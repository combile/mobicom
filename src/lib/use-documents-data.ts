"use client";

import { useEffect, useState } from "react";

export type DocumentAttachment = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  expiresAt: string | null;
  expired: boolean;
  url: string;
};

export type DocumentSummary = {
  id: string;
  title: string;
  bodyPreview: string;
  projectId: string | null;
  projectName: string | null;
  categoryId: string | null;
  createdById: string;
  createdByName: string | null;
  updatedById: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  /** First live image attachment, if any — the rest have no way to render as a small preview. */
  thumbnailUrl: string | null;
  attachmentCount: number;
};

export type DocumentDetail = DocumentSummary & { body: string; attachments: DocumentAttachment[] };

// "lab" is a sentinel distinct from null: null means "no project filter
// applied", "lab" means "only documents with no project at all".
export type ProjectFilter = string | "lab" | null;

export function useDocumentsData(enabled: boolean) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>(null);
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    // Archived documents are fetched too when the toggle is on, so switching
    // it does not need a second round trip once the list has loaded once.
    params.set("includeArchived", "true");
    fetch(`/api/mobion/documents?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        setDocuments(data.documents ?? []);
        setLoadError(null);
      })
      .catch(() => setLoadError("문서 목록을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [enabled]);

  async function createDocument(input: {
    title: string;
    body: string;
    projectId: string | null;
    categoryId: string | null;
    /** Ids of files already uploaded (with no documentId) while composing this document. */
    attachmentIds?: string[];
  }) {
    const res = await fetch("/api/mobion/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        projectId: input.projectId,
        categoryId: input.categoryId,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "문서 생성에 실패했습니다.");
    }
    const data = await res.json();
    const id = data.document.id as string;

    if (input.attachmentIds && input.attachmentIds.length > 0) {
      await linkAttachments(id, input.attachmentIds);
    }

    load();
    return id;
  }

  /** Uploads one file, streaming its bytes directly — see mobion-uploads.ts. */
  async function uploadAttachment(file: File, documentId: string | null) {
    const params = new URLSearchParams({ filename: file.name });
    if (documentId) params.set("documentId", documentId);
    const res = await fetch(`/api/mobion/documents/attachments?${params}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `${file.name} 업로드에 실패했습니다.`);
    }
    const data = await res.json();
    return data.attachment as DocumentAttachment;
  }

  /** Joins files uploaded before a document existed to the document, once it does. */
  async function linkAttachments(documentId: string, attachmentIds: string[]) {
    const res = await fetch("/api/mobion/documents/attachments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, attachmentIds }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "파일을 문서에 붙이지 못했습니다.");
    }
  }

  async function removeAttachment(attachmentId: string) {
    const res = await fetch(`/api/mobion/documents/attachments/${attachmentId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "파일을 삭제하지 못했습니다.");
    }
    // Only the current document's summary (thumbnail/count) can go stale from
    // this, and there is no cheap way to know which row that is from here —
    // a full reload is simpler than threading the document id through.
    load();
  }

  async function fetchDocument(id: string): Promise<DocumentDetail> {
    const res = await fetch(`/api/mobion/documents/${id}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "문서를 불러오지 못했습니다.");
    }
    const data = await res.json();
    return data.document as DocumentDetail;
  }

  /**
   * Edits a document.
   *
   * Reloads the list on success rather than merging the PATCH response into
   * local state — the response carries a full `body`, but the list holds only
   * a `bodyPreview`, so a hand-merge would leave a stale preview showing after
   * a body edit until the next unrelated refresh.
   */
  async function updateDocument(
    id: string,
    patch: { title?: string; body?: string; projectId?: string | null; categoryId?: string | null },
  ) {
    setPendingId(id);
    try {
      const res = await fetch(`/api/mobion/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "문서 수정에 실패했습니다.");
      }
      const data = await res.json();
      load();
      return data.document as DocumentDetail;
    } finally {
      setPendingId(null);
    }
  }

  async function setArchived(id: string, archived: boolean) {
    const previous = documents;
    setPendingId(id);
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, archivedAt: archived ? new Date().toISOString() : null } : d,
      ),
    );
    try {
      const res = await fetch(`/api/mobion/documents/${id}/archive`, {
        method: archived ? "PUT" : "DELETE",
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setDocuments(previous);
      setLoadError(archived ? "문서 보관에 실패했습니다." : "문서 보관 해제에 실패했습니다.");
    } finally {
      setPendingId(null);
    }
  }

  const archiveDocument = (id: string) => setArchived(id, true);
  const unarchiveDocument = (id: string) => setArchived(id, false);

  const term = search.trim().toLowerCase();
  const visible = documents.filter((d) => {
    // "보관됨 보기" adds archived documents to the list rather than
    // replacing it — turning it off just hides them again.
    if (!showArchived && d.archivedAt) return false;
    if (projectFilter === "lab" && d.projectId !== null) return false;
    if (projectFilter && projectFilter !== "lab" && d.projectId !== projectFilter) return false;
    if (authorFilter && d.createdById !== authorFilter) return false;
    if (term && !d.title.toLowerCase().includes(term)) return false;
    return true;
  });

  return {
    documents,
    visible,
    loadError,
    loading,
    search,
    setSearch,
    projectFilter,
    setProjectFilter,
    authorFilter,
    setAuthorFilter,
    showArchived,
    setShowArchived,
    pendingId,
    isEmpty: documents.length === 0,
    createDocument,
    fetchDocument,
    updateDocument,
    uploadAttachment,
    linkAttachments,
    removeAttachment,
    archiveDocument,
    unarchiveDocument,
    reload: load,
  };
}

export type DocumentsData = ReturnType<typeof useDocumentsData>;
