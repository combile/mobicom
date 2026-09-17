"use client";

import { useEffect, useState } from "react";

export type DocumentCategory = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
};

/**
 * Folders for the documents sidebar.
 *
 * Returned and kept flat — the sidebar builds its own tree from `parentId`
 * (see buildCategoryTree in DocumentsView.tsx) so this hook stays a plain
 * CRUD list, the same shape the server already returns.
 */
export function useDocumentCategoriesData(enabled: boolean) {
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/mobion/documents/categories")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        setCategories(data.categories ?? []);
        setLoadError(null);
      })
      .catch(() => setLoadError("카테고리 목록을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [enabled]);

  async function createCategory(name: string, parentId: string | null) {
    const res = await fetch("/api/mobion/documents/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "카테고리 생성에 실패했습니다.");
    }
    const data = await res.json();
    load();
    return data.category.id as string;
  }

  async function renameCategory(id: string, name: string) {
    const res = await fetch(`/api/mobion/documents/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "카테고리 이름을 바꾸지 못했습니다.");
    }
    load();
  }

  async function moveCategory(id: string, parentId: string | null) {
    const res = await fetch(`/api/mobion/documents/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "카테고리를 옮기지 못했습니다.");
    }
    load();
  }

  async function deleteCategory(id: string) {
    const res = await fetch(`/api/mobion/documents/categories/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "카테고리를 삭제하지 못했습니다.");
    }
    load();
  }

  return {
    categories,
    loadError,
    loading,
    createCategory,
    renameCategory,
    moveCategory,
    deleteCategory,
    reload: load,
  };
}

export type DocumentCategoriesData = ReturnType<typeof useDocumentCategoriesData>;
