"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CustomSelect from "./CustomSelect";
import ConfirmDialog from "./ConfirmDialog";
import type { DocumentDetail, DocumentSummary, DocumentsData } from "@/lib/use-documents-data";
import type { DocumentCategoriesData, DocumentCategory } from "@/lib/use-document-categories-data";
import { ErrorText } from "./modal-styles";

type ProjectOption = { id: string; name: string };

/** One attachment as the editor tracks it while composing — see DocumentsView's uploadAttachment flow. */
type AttachmentState = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  uploading: boolean;
  url: string | null;
};

type Draft = {
  title: string;
  body: string;
  projectId: string | null;
  categoryId: string | null;
  attachments: AttachmentState[];
};

type PanelMode = "view" | "edit" | "create";

type CategoryNode = {
  category: DocumentCategory;
  children: CategoryNode[];
  documents: DocumentSummary[];
};

const COLLAPSED_STORAGE_KEY = "mobion-documents-collapsed-categories";
const UNCATEGORIZED = "__uncategorized__";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Best-effort icon for a file this app cannot render an actual thumbnail for. */
function iconForMime(mime: string, filename: string) {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "picture_as_pdf";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (mime.includes("presentation") || ["ppt", "pptx"].includes(ext)) return "slideshow";
  if (mime.includes("spreadsheet") || ["xls", "xlsx", "csv"].includes(ext)) return "table_chart";
  if (mime.includes("word") || ["doc", "docx"].includes(ext)) return "description";
  if (mime.includes("zip") || ["zip", "rar", "7z"].includes(ext)) return "folder_zip";
  return "attach_file";
}

function buildCategoryTree(categories: DocumentCategory[], documents: DocumentSummary[]) {
  const childrenOf = new Map<string | null, DocumentCategory[]>();
  for (const c of categories) {
    const key = c.parentId;
    (childrenOf.get(key) ?? childrenOf.set(key, []).get(key)!).push(c);
  }
  const docsOf = new Map<string | null, DocumentSummary[]>();
  for (const d of documents) {
    const key = d.categoryId;
    (docsOf.get(key) ?? docsOf.set(key, []).get(key)!).push(d);
  }

  function build(parentId: string | null): CategoryNode[] {
    return (childrenOf.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "ko"))
      .map((category) => ({
        category,
        children: build(category.id),
        documents: (docsOf.get(category.id) ?? []).slice().sort((a, b) => a.title.localeCompare(b.title, "ko")),
      }));
  }

  return { roots: build(null), uncategorized: (docsOf.get(null) ?? []).slice().sort((a, b) => a.title.localeCompare(b.title, "ko")) };
}

/** Indented flat option list for a category `<select>` — depth shown as a tree connector prefix. */
function flattenCategoriesForSelect(categories: DocumentCategory[]) {
  const childrenOf = new Map<string | null, DocumentCategory[]>();
  for (const c of categories) {
    const key = c.parentId;
    (childrenOf.get(key) ?? childrenOf.set(key, []).get(key)!).push(c);
  }
  const out: { value: string; label: string }[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const c of (childrenOf.get(parentId) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, "ko"))) {
      out.push({ value: c.id, label: `${"　".repeat(depth)}${depth > 0 ? "└ " : ""}${c.name}` });
      walk(c.id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

/**
 * Documents, Notion/Huly-sidebar style (MOB-DOC-001~005): a category tree on
 * the left, the selected document's markdown on the right. Writing is open
 * to any logged-in member, same as projects/tasks/milestones — there is no
 * per-document ACL. Archiving is the one exception, restricted to
 * Lead/Professor (`canArchive`) and enforced again on the server.
 */
export default function DocumentsView({
  data,
  categoriesData,
  canArchive,
  projects,
}: {
  data: DocumentsData;
  categoriesData: DocumentCategoriesData;
  canArchive: boolean;
  projects: ProjectOption[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<DocumentDetail | null>(null);
  const [loadingActive, setLoadingActive] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>("view");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<DocumentSummary | null>(null);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<DocumentCategory | null>(null);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (raw) setCollapsed(JSON.parse(raw));
    } catch {
      // private browsing / storage disabled — the tree just starts fully open
    }
  }, []);
  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // best effort
      }
      return next;
    });
  }

  // Which category is mid-creation as an inline "type the name" row —
  // undefined means none, null means "a new root-level category".
  const [creatingCategoryUnder, setCreatingCategoryUnder] = useState<string | null | undefined>(undefined);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function selectDocument(id: string) {
    setSelectedId(id);
    setPanelMode("view");
    setDraft(null);
    setFormError(null);
    setLoadingActive(true);
    try {
      const full = await data.fetchDocument(id);
      setActiveDoc(full);
    } catch (error) {
      setActiveDoc(null);
      setFormError(error instanceof Error ? error.message : "문서를 불러오지 못했습니다.");
    } finally {
      setLoadingActive(false);
    }
  }

  function startCreate(categoryId: string | null = null) {
    setSelectedId(null);
    setActiveDoc(null);
    setFormError(null);
    setPanelMode("create");
    setDraft({ title: "", body: "", projectId: null, categoryId, attachments: [] });
  }

  function startEdit() {
    if (!activeDoc) return;
    setFormError(null);
    setPanelMode("edit");
    setDraft({
      title: activeDoc.title,
      body: activeDoc.body,
      projectId: activeDoc.projectId,
      categoryId: activeDoc.categoryId,
      attachments: activeDoc.attachments
        .filter((a) => !a.expired)
        .map((a) => ({ id: a.id, filename: a.filename, mime: a.mime, size: a.size, uploading: false, url: a.url })),
    });
  }

  function cancelEdit() {
    setFormError(null);
    setDraft(null);
    setPanelMode("view");
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    setFormError(null);
    try {
      if (panelMode === "create") {
        const attachmentIds = draft.attachments.filter((a) => !a.uploading).map((a) => a.id);
        const id = await data.createDocument({
          title: draft.title,
          body: draft.body,
          projectId: draft.projectId,
          categoryId: draft.categoryId,
          attachmentIds,
        });
        setDraft(null);
        await selectDocument(id);
      } else if (panelMode === "edit" && activeDoc) {
        await data.updateDocument(activeDoc.id, {
          title: draft.title,
          body: draft.body,
          projectId: draft.projectId,
          categoryId: draft.categoryId,
        });
        // Attachments always upload unlinked (documentId: null — see
        // DocumentEditor's handleFiles), the same way a brand-new document's
        // do, so both modes join them the same way here. Already-linked
        // attachments (loaded when edit mode opened) simply do not match the
        // link route's "document_id IS NULL" guard and are left untouched.
        const attachmentIds = draft.attachments.filter((a) => !a.uploading).map((a) => a.id);
        if (attachmentIds.length > 0) {
          await data.linkAttachments(activeDoc.id, attachmentIds);
        }
        setDraft(null);
        await selectDocument(activeDoc.id);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle(doc: DocumentSummary, archived: boolean) {
    if (archived) await data.unarchiveDocument(doc.id);
    else setConfirmArchive(doc);
    if (selectedId === doc.id) selectDocument(doc.id);
  }

  async function confirmArchiveNow() {
    if (!confirmArchive) return;
    const id = confirmArchive.id;
    setConfirmArchive(null);
    await data.archiveDocument(id);
    if (selectedId === id) selectDocument(id);
  }

  // --- category tree actions -------------------------------------------------

  function beginCreateCategory(parentId: string | null) {
    setCreatingCategoryUnder(parentId);
    setNewCategoryName("");
    if (parentId) setCollapsed((prev) => ({ ...prev, [parentId]: false }));
  }

  async function commitCreateCategory() {
    const name = newCategoryName.trim();
    const parentId = creatingCategoryUnder ?? null;
    setCreatingCategoryUnder(undefined);
    if (!name) return;
    try {
      await categoriesData.createCategory(name, parentId);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "카테고리 생성에 실패했습니다.");
    }
  }

  function beginRenameCategory(category: DocumentCategory) {
    setRenamingCategoryId(category.id);
    setRenameValue(category.name);
  }

  async function commitRenameCategory() {
    const id = renamingCategoryId;
    const name = renameValue.trim();
    setRenamingCategoryId(null);
    if (!id || !name) return;
    try {
      await categoriesData.renameCategory(id, name);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "카테고리 이름을 바꾸지 못했습니다.");
    }
  }

  async function deleteCategoryNow() {
    if (!confirmDeleteCategory) return;
    const id = confirmDeleteCategory.id;
    setConfirmDeleteCategory(null);
    try {
      await categoriesData.deleteCategory(id);
      if (activeDoc?.categoryId === id) selectDocument(activeDoc.id);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "카테고리를 삭제하지 못했습니다.");
    }
  }

  // --- derived views -----------------------------------------------------

  const term = data.search.trim().toLowerCase();
  const searching = term.length > 0;

  function matchesFilters(d: DocumentSummary) {
    if (data.projectFilter === "lab" && d.projectId !== null) return false;
    if (data.projectFilter && data.projectFilter !== "lab" && d.projectId !== data.projectFilter) return false;
    if (data.authorFilter && d.createdById !== data.authorFilter) return false;
    return true;
  }

  const activeDocsFiltered = useMemo(
    () => data.documents.filter((d) => !d.archivedAt && matchesFilters(d)),
    [data.documents, data.projectFilter, data.authorFilter],
  );
  const archivedDocsFiltered = useMemo(
    () => data.documents.filter((d) => d.archivedAt && matchesFilters(d)),
    [data.documents, data.projectFilter, data.authorFilter],
  );
  const searchResults = useMemo(
    () => activeDocsFiltered.filter((d) => d.title.toLowerCase().includes(term)),
    [activeDocsFiltered, term],
  );

  const tree = useMemo(
    () => buildCategoryTree(categoriesData.categories, activeDocsFiltered),
    [categoriesData.categories, activeDocsFiltered],
  );

  const authors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const doc of data.documents) {
      if (!seen.has(doc.createdById)) seen.set(doc.createdById, doc.createdByName ?? "알 수 없음");
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [data.documents]);

  const categoryOptions = useMemo(() => flattenCategoriesForSelect(categoriesData.categories), [categoriesData.categories]);

  const [archivedOpen, setArchivedOpen] = useState(false);

  return (
    <Main>
      <Sidebar>
        <SidebarHeader>
          <SidebarTitle>문서</SidebarTitle>
          <NewButtons>
            <IconTextButton type="button" onClick={() => startCreate(null)} title="새 문서">
              <span className="material-symbols-outlined">note_add</span>
            </IconTextButton>
            <IconTextButton type="button" onClick={() => beginCreateCategory(null)} title="새 카테고리">
              <span className="material-symbols-outlined">create_new_folder</span>
            </IconTextButton>
          </NewButtons>
        </SidebarHeader>

        <SearchWrap>
          <span className="material-symbols-outlined">search</span>
          <SearchInput
            type="search"
            value={data.search}
            onChange={(e) => data.setSearch(e.target.value)}
            placeholder="문서 검색"
            aria-label="문서 검색"
          />
        </SearchWrap>

        <FilterRow>
          <CustomSelect
            fullWidth
            value={data.projectFilter ?? ""}
            onChange={(v) => data.setProjectFilter(v === "" ? null : v)}
            options={[
              { value: "", label: "전체 프로젝트" },
              { value: "lab", label: "공용 문서" },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <CustomSelect
            fullWidth
            value={data.authorFilter ?? ""}
            onChange={(v) => data.setAuthorFilter(v === "" ? null : v)}
            options={[{ value: "", label: "전체 작성자" }, ...authors.map((a) => ({ value: a.id, label: a.name }))]}
          />
        </FilterRow>

        {data.loadError && <ErrorText>{data.loadError}</ErrorText>}
        {categoriesData.loadError && <ErrorText>{categoriesData.loadError}</ErrorText>}

        <Tree>
          {searching ? (
            searchResults.length === 0 ? (
              <EmptyTreeHint>검색 결과가 없습니다</EmptyTreeHint>
            ) : (
              searchResults.map((doc) => (
                <DocRow key={doc.id} data-active={doc.id === selectedId || undefined}>
                  <DocRowButton
                    type="button"
                    style={{ paddingLeft: depthPadding(0) }}
                    onClick={() => selectDocument(doc.id)}
                  >
                    <span className="material-symbols-outlined">description</span>
                    <DocRowLabel>{doc.title}</DocRowLabel>
                  </DocRowButton>
                </DocRow>
              ))
            )
          ) : (
            <>
              {creatingCategoryUnder === null && (
                <InlineCategoryInput style={{ paddingLeft: depthPadding(0) }}>
                  <span className="material-symbols-outlined">folder</span>
                  <input
                    autoFocus
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onBlur={commitCreateCategory}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setCreatingCategoryUnder(undefined);
                    }}
                    placeholder="카테고리 이름"
                  />
                </InlineCategoryInput>
              )}

              {tree.roots.map((node) => (
                <CategoryTreeNode
                  key={node.category.id}
                  node={node}
                  depth={0}
                  collapsed={collapsed}
                  onToggle={toggleCollapsed}
                  selectedId={selectedId}
                  onSelectDocument={selectDocument}
                  onAddDocument={startCreate}
                  onAddSubcategory={beginCreateCategory}
                  onDeleteCategory={setConfirmDeleteCategory}
                  renamingCategoryId={renamingCategoryId}
                  renameValue={renameValue}
                  onRenameChange={setRenameValue}
                  onBeginRename={beginRenameCategory}
                  onCommitRename={commitRenameCategory}
                  onCancelRename={() => setRenamingCategoryId(null)}
                  creatingCategoryUnder={creatingCategoryUnder}
                  newCategoryName={newCategoryName}
                  onNewCategoryNameChange={setNewCategoryName}
                  onCommitCreateCategory={commitCreateCategory}
                  onCancelCreateCategory={() => setCreatingCategoryUnder(undefined)}
                />
              ))}

              {tree.uncategorized.length > 0 && (
                <>
                  <SectionLabel>미분류</SectionLabel>
                  {tree.uncategorized.map((doc) => (
                    <DocRow key={doc.id} data-active={doc.id === selectedId || undefined}>
                      <DocRowButton
                        type="button"
                        style={{ paddingLeft: depthPadding(1) }}
                        onClick={() => selectDocument(doc.id)}
                      >
                        <span className="material-symbols-outlined">description</span>
                        <DocRowLabel>{doc.title}</DocRowLabel>
                      </DocRowButton>
                    </DocRow>
                  ))}
                </>
              )}

              {archivedDocsFiltered.length > 0 && (
                <ArchivedSection>
                  <CategoryRow onClick={() => setArchivedOpen((v) => !v)}>
                    <span className="material-symbols-outlined">
                      {archivedOpen ? "expand_more" : "chevron_right"}
                    </span>
                    <span className="material-symbols-outlined">archive</span>
                    <CategoryName>보관됨</CategoryName>
                    <CategoryCount>{archivedDocsFiltered.length}</CategoryCount>
                  </CategoryRow>
                  {archivedOpen &&
                    archivedDocsFiltered.map((doc) => (
                      <DocRow key={doc.id} data-active={doc.id === selectedId || undefined} data-archived>
                        <DocRowButton
                          type="button"
                          style={{ paddingLeft: depthPadding(1) }}
                          onClick={() => selectDocument(doc.id)}
                        >
                          <span className="material-symbols-outlined">description</span>
                          <DocRowLabel>{doc.title}</DocRowLabel>
                        </DocRowButton>
                        {canArchive && (
                          <RestoreButton
                            type="button"
                            title="보관 해제"
                            onClick={() => handleArchiveToggle(doc, true)}
                          >
                            <span className="material-symbols-outlined">unarchive</span>
                          </RestoreButton>
                        )}
                      </DocRow>
                    ))}
                </ArchivedSection>
              )}
            </>
          )}
        </Tree>
      </Sidebar>

      <Panel>
        {panelMode === "view" && !activeDoc && !loadingActive && (
          <EmptyPanel>
            <span className="material-symbols-outlined">description</span>
            <EmptyPanelTitle>왼쪽에서 문서를 선택하거나 새로 만들어 보세요</EmptyPanelTitle>
          </EmptyPanel>
        )}

        {panelMode === "view" && loadingActive && <EmptyPanel>불러오는 중...</EmptyPanel>}

        {panelMode === "view" && activeDoc && !loadingActive && (
          <DocumentReadView
            doc={activeDoc}
            canArchive={canArchive}
            onEdit={startEdit}
            onArchive={() => setConfirmArchive(activeDoc)}
            onUnarchive={() => handleArchiveToggle(activeDoc, true)}
          />
        )}

        {(panelMode === "edit" || panelMode === "create") && draft && (
          <DocumentEditor
            draft={draft}
            // Accepts a value or an updater function. The async upload
            // handlers inside DocumentEditor need the updater form so they
            // never overwrite edits made while an upload was in flight.
            onChange={(next) =>
              setDraft((prev) => (prev ? (typeof next === "function" ? next(prev) : next) : prev))
            }
            projects={projects}
            categoryOptions={categoryOptions}
            saving={saving}
            error={formError}
            onCancel={cancelEdit}
            onSave={saveDraft}
            uploadAttachment={data.uploadAttachment}
            removeAttachment={data.removeAttachment}
            onUploadError={setFormError}
            isNew={panelMode === "create"}
          />
        )}

        {formError && panelMode === "view" && <ErrorText>{formError}</ErrorText>}
      </Panel>

      {confirmArchive && (
        <ConfirmDialog
          title="문서를 보관할까요?"
          description={`"${confirmArchive.title}" 문서를 보관합니다. 삭제되지 않으며 언제든 복원할 수 있습니다.`}
          confirmLabel="보관"
          onCancel={() => setConfirmArchive(null)}
          onConfirm={confirmArchiveNow}
        />
      )}

      {confirmDeleteCategory && (
        <ConfirmDialog
          title="카테고리를 삭제할까요?"
          description={`"${confirmDeleteCategory.name}" 카테고리를 삭제합니다. 하위 카테고리도 함께 삭제되지만, 안에 있던 문서는 삭제되지 않고 미분류로 남습니다.`}
          confirmLabel="삭제"
          onCancel={() => setConfirmDeleteCategory(null)}
          onConfirm={deleteCategoryNow}
        />
      )}
    </Main>
  );
}

/** One folder row, its inline rename/create-child affordances, and its subtree — recurses for nested folders. */
function CategoryTreeNode(props: {
  node: CategoryNode;
  depth: number;
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelectDocument: (id: string) => void;
  onAddDocument: (categoryId: string) => void;
  onAddSubcategory: (parentId: string) => void;
  onDeleteCategory: (category: DocumentCategory) => void;
  renamingCategoryId: string | null;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onBeginRename: (category: DocumentCategory) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  creatingCategoryUnder: string | null | undefined;
  newCategoryName: string;
  onNewCategoryNameChange: (v: string) => void;
  onCommitCreateCategory: () => void;
  onCancelCreateCategory: () => void;
}) {
  const { node, depth } = props;
  const isOpen = !props.collapsed[node.category.id];
  const isRenaming = props.renamingCategoryId === node.category.id;
  const hasContent = node.children.length > 0 || node.documents.length > 0;

  return (
    <>
      <CategoryRow>
        <CategoryClickArea
          type="button"
          style={{ paddingLeft: depthPadding(depth) }}
          onClick={() => props.onToggle(node.category.id)}
          disabled={!hasContent}
        >
          <span className="material-symbols-outlined">
            {hasContent ? (isOpen ? "expand_more" : "chevron_right") : "folder"}
          </span>
          {hasContent && <span className="material-symbols-outlined">{isOpen ? "folder_open" : "folder"}</span>}
          {isRenaming ? (
            <RenameInput
              autoFocus
              value={props.renameValue}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => props.onRenameChange(e.target.value)}
              onBlur={props.onCommitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") props.onCancelRename();
              }}
            />
          ) : (
            <CategoryName
              onDoubleClick={(e) => {
                e.stopPropagation();
                props.onBeginRename(node.category);
              }}
            >
              {node.category.name}
            </CategoryName>
          )}
        </CategoryClickArea>
        <RowActions>
          <RowActionButton
            type="button"
            title="이 카테고리에 문서 추가"
            onClick={() => props.onAddDocument(node.category.id)}
          >
            <span className="material-symbols-outlined">note_add</span>
          </RowActionButton>
          <RowActionButton
            type="button"
            title="하위 카테고리 추가"
            onClick={() => props.onAddSubcategory(node.category.id)}
          >
            <span className="material-symbols-outlined">create_new_folder</span>
          </RowActionButton>
          <RowActionButton type="button" title="삭제" onClick={() => props.onDeleteCategory(node.category)}>
            <span className="material-symbols-outlined">delete</span>
          </RowActionButton>
        </RowActions>
      </CategoryRow>

      {isOpen && props.creatingCategoryUnder === node.category.id && (
        <InlineCategoryInput style={{ paddingLeft: depthPadding(depth + 1) }}>
          <span className="material-symbols-outlined">folder</span>
          <input
            autoFocus
            value={props.newCategoryName}
            onChange={(e) => props.onNewCategoryNameChange(e.target.value)}
            onBlur={props.onCommitCreateCategory}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") props.onCancelCreateCategory();
            }}
            placeholder="카테고리 이름"
          />
        </InlineCategoryInput>
      )}

      {isOpen &&
        node.children.map((child) => (
          <CategoryTreeNode key={child.category.id} {...props} node={child} depth={depth + 1} />
        ))}

      {isOpen &&
        node.documents.map((doc) => (
          <DocRow key={doc.id} data-active={doc.id === props.selectedId || undefined}>
            <DocRowButton
              type="button"
              style={{ paddingLeft: depthPadding(depth + 1) }}
              onClick={() => props.onSelectDocument(doc.id)}
            >
              <span className="material-symbols-outlined">description</span>
              <DocRowLabel>{doc.title}</DocRowLabel>
            </DocRowButton>
          </DocRow>
        ))}
    </>
  );
}

/** Read view: rendered markdown, metadata, attachments. */
function DocumentReadView({
  doc,
  canArchive,
  onEdit,
  onArchive,
  onUnarchive,
}: {
  doc: DocumentDetail;
  canArchive: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}) {
  const archived = Boolean(doc.archivedAt);
  return (
    <DocScroll>
      <DocHeader>
        <DocHeaderLeft>
          <DocIcon className="material-symbols-outlined">description</DocIcon>
          <DocTitle>{doc.title}</DocTitle>
        </DocHeaderLeft>
        <DocHeaderActions>
          {archived ? (
            <ArchivedTag>보관됨</ArchivedTag>
          ) : (
            <button type="button" onClick={onEdit}>
              편집
            </button>
          )}
          {canArchive &&
            (archived ? (
              <IconTextButton type="button" title="보관 해제" onClick={onUnarchive}>
                <span className="material-symbols-outlined">unarchive</span>
              </IconTextButton>
            ) : (
              <IconTextButton type="button" title="보관" onClick={onArchive}>
                <span className="material-symbols-outlined">archive</span>
              </IconTextButton>
            ))}
        </DocHeaderActions>
      </DocHeader>

      <DocMeta>
        {doc.projectName ? <MetaChip>{doc.projectName}</MetaChip> : <MetaChip data-lab>공용 문서</MetaChip>}
        <MetaText>{doc.createdByName ?? "알 수 없음"}</MetaText>
        <MetaText>·</MetaText>
        <MetaText>{formatDate(doc.updatedAt)} 수정</MetaText>
      </DocMeta>

      {doc.attachments.length > 0 && (
        <AttachmentGrid>
          {doc.attachments.map((a) =>
            a.expired ? (
              <AttachmentTile key={a.id} data-expired>
                <span className="material-symbols-outlined">delete_history</span>
                <AttachmentTileName>{a.filename} · 삭제됨</AttachmentTileName>
              </AttachmentTile>
            ) : a.mime.startsWith("image/") ? (
              <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                <AttachmentImage src={a.url} alt={a.filename} loading="lazy" />
              </a>
            ) : (
              <AttachmentTileLink key={a.id} href={a.url} target="_blank" rel="noreferrer">
                <span className="material-symbols-outlined">{iconForMime(a.mime, a.filename)}</span>
                <AttachmentTileName>{a.filename}</AttachmentTileName>
                <AttachmentTileSize>{formatBytes(a.size)}</AttachmentTileSize>
              </AttachmentTileLink>
            ),
          )}
        </AttachmentGrid>
      )}

      <Prose>
        {doc.body.trim() ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.body}</ReactMarkdown>
        ) : (
          <EmptyBodyHint>내용이 없습니다. "편집"을 눌러 작성해 보세요.</EmptyBodyHint>
        )}
      </Prose>
    </DocScroll>
  );
}

/** Create/edit form: title, project/category pickers, markdown source, attachments. */
function DocumentEditor({
  draft,
  onChange,
  projects,
  categoryOptions,
  saving,
  error,
  onCancel,
  onSave,
  uploadAttachment,
  removeAttachment,
  onUploadError,
  isNew,
}: {
  draft: Draft;
  onChange: (next: Draft | ((prev: Draft) => Draft)) => void;
  projects: ProjectOption[];
  categoryOptions: { value: string; label: string }[];
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
  uploadAttachment: DocumentsData["uploadAttachment"];
  removeAttachment: DocumentsData["removeAttachment"];
  onUploadError: (message: string) => void;
  isNew: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const anyUploading = draft.attachments.some((a) => a.uploading);

  /**
   * Every mutation below goes through the updater-function form of
   * `onChange`, not a plain object built from this closure's `draft` — an
   * upload crosses an `await`, and by the time it resolves `draft` here can
   * be stale (title typed, another file finished). Reading through the
   * setter's own `prev` is what keeps concurrent uploads from clobbering
   * each other or a title edit made mid-upload.
   *
   * Uploads always go up unlinked (documentId: null), whether this is a new
   * document or an existing one being edited — DocumentsView's saveDraft
   * joins whatever finished uploading to the document afterward, in both
   * modes, the same way createDocument already had to for the brand-new
   * case (the document has no id to attach to until it is saved).
   */
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const placeholder: AttachmentState = {
        id: tempId,
        filename: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        uploading: true,
        url: null,
      };
      onChange((prev) => ({ ...prev, attachments: [...prev.attachments, placeholder] }));

      try {
        const uploaded = await uploadAttachment(file, null);
        onChange((prev) =>
          prev.attachments.some((a) => a.id === tempId)
            ? {
                ...prev,
                attachments: prev.attachments.map((a) =>
                  a.id === tempId
                    ? {
                        id: uploaded.id,
                        filename: uploaded.filename,
                        mime: uploaded.mime,
                        size: uploaded.size,
                        uploading: false,
                        url: uploaded.url,
                      }
                    : a,
                ),
              }
            : prev,
        );
      } catch (err) {
        onChange((prev) => ({ ...prev, attachments: prev.attachments.filter((a) => a.id !== tempId) }));
        onUploadError(err instanceof Error ? err.message : `${file.name} 업로드에 실패했습니다.`);
      }
    }
  }

  /**
   * Uploads an image and drops `![name](url)` into the body at the cursor,
   * so a screenshot can sit between two paragraphs instead of only ever
   * appearing in the attachment strip above the text.
   *
   * A placeholder is inserted immediately and swapped for the real markdown
   * once the upload resolves, rather than tracking the cursor position
   * across the `await` — the user may well have kept typing elsewhere in the
   * textarea in the meantime, and a stale cursor index would insert the link
   * in the wrong place (or the wrong document of text) by then. Editing the
   * `body` string directly for this (not going through the textarea's own
   * onChange) is safe because `onChange` always applies against the setter's
   * latest `prev`, same as everywhere else in this component.
   */
  async function handleInsertImage(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    const textarea = bodyRef.current;
    const cursor = textarea ? textarea.selectionStart : draft.body.length;
    const placeholder = `![${file.name} 업로드 중...]()`;
    onChange((prev) => ({
      ...prev,
      body: prev.body.slice(0, cursor) + placeholder + prev.body.slice(cursor),
    }));

    try {
      const uploaded = await uploadAttachment(file, null);
      const markdown = `![${uploaded.filename}](${uploaded.url})`;
      onChange((prev) => ({
        ...prev,
        // Also listed as a regular attachment (same upload, same record) so
        // it is still downloadable and linked to the document on save even
        // if the markdown referencing it is later edited out.
        attachments: [
          ...prev.attachments,
          {
            id: uploaded.id,
            filename: uploaded.filename,
            mime: uploaded.mime,
            size: uploaded.size,
            uploading: false,
            url: uploaded.url,
          },
        ],
        body: prev.body.includes(placeholder) ? prev.body.replace(placeholder, markdown) : prev.body,
      }));
    } catch (err) {
      onChange((prev) => ({ ...prev, body: prev.body.replace(placeholder, "") }));
      onUploadError(err instanceof Error ? err.message : `${file.name} 업로드에 실패했습니다.`);
    }
  }

  async function handleRemove(attachment: AttachmentState) {
    if (attachment.uploading) return;
    if (!attachment.id.startsWith("pending-")) {
      try {
        await removeAttachment(attachment.id);
      } catch (err) {
        onUploadError(err instanceof Error ? err.message : "파일을 삭제하지 못했습니다.");
        return;
      }
    }
    onChange((prev) => ({ ...prev, attachments: prev.attachments.filter((a) => a.id !== attachment.id) }));
  }

  return (
    <DocScroll>
      <EditorTitleInput
        value={draft.title}
        onChange={(e) => onChange((prev) => ({ ...prev, title: e.target.value }))}
        placeholder="제목 없음"
        autoFocus={isNew}
      />

      <EditorMetaRow>
        <EditorField>
          <label>프로젝트</label>
          <CustomSelect
            fullWidth
            value={draft.projectId ?? ""}
            onChange={(v) => onChange((prev) => ({ ...prev, projectId: v === "" ? null : v }))}
            options={[{ value: "", label: "공용 문서" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
          />
        </EditorField>
        <EditorField>
          <label>카테고리</label>
          <CustomSelect
            fullWidth
            value={draft.categoryId ?? ""}
            onChange={(v) => onChange((prev) => ({ ...prev, categoryId: v === "" ? null : v }))}
            options={[{ value: "", label: "미분류" }, ...categoryOptions]}
          />
        </EditorField>
      </EditorMetaRow>

      <EditorField>
        <label>첨부 파일 (발표 자료 등)</label>
        <AttachButton type="button" onClick={() => fileInputRef.current?.click()}>
          <span className="material-symbols-outlined">upload_file</span>
          파일 추가
        </AttachButton>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {draft.attachments.length > 0 && (
          <AttachmentList>
            {draft.attachments.map((a) => (
              <AttachmentItem key={a.id}>
                {a.mime.startsWith("image/") && a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer">
                    <AttachmentThumb src={a.url} alt={a.filename} />
                  </a>
                ) : (
                  <span className="material-symbols-outlined">{iconForMime(a.mime, a.filename)}</span>
                )}
                <AttachmentMeta>
                  {a.url && !a.uploading ? (
                    <AttachmentName href={a.url} target="_blank" rel="noreferrer">
                      {a.filename}
                    </AttachmentName>
                  ) : (
                    <AttachmentName as="span">{a.filename}</AttachmentName>
                  )}
                  <AttachmentSize>{a.uploading ? "업로드 중..." : formatBytes(a.size)}</AttachmentSize>
                </AttachmentMeta>
                <RemoveAttachmentButton
                  type="button"
                  disabled={a.uploading}
                  onClick={() => handleRemove(a)}
                  aria-label="첨부 파일 제거"
                >
                  <span className="material-symbols-outlined">close</span>
                </RemoveAttachmentButton>
              </AttachmentItem>
            ))}
          </AttachmentList>
        )}
      </EditorField>

      <EditorField>
        <BodyLabelRow>
          <label>본문 (마크다운)</label>
          <AttachButton type="button" onClick={() => imageInputRef.current?.click()}>
            <span className="material-symbols-outlined">add_photo_alternate</span>
            본문에 이미지 삽입
          </AttachButton>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              handleInsertImage(e.target.files);
              e.target.value = "";
            }}
          />
        </BodyLabelRow>
        <BodyTextarea
          ref={bodyRef}
          value={draft.body}
          onChange={(e) => onChange((prev) => ({ ...prev, body: e.target.value }))}
          placeholder={"# 제목\n\n마크다운 문법으로 작성하세요. **굵게**, 목록, 표, 체크박스(- [ ])도 지원합니다.\n커서 위치에 이미지를 넣으려면 위의 \"본문에 이미지 삽입\"을 누르세요."}
          rows={18}
        />
      </EditorField>

      {error && <ErrorText>{error}</ErrorText>}

      <EditorActions>
        <button type="button" onClick={onCancel}>
          취소
        </button>
        <button type="button" onClick={onSave} disabled={saving || anyUploading || !draft.title.trim()}>
          {saving ? "저장하는 중..." : anyUploading ? "업로드 중..." : "저장"}
        </button>
      </EditorActions>
    </DocScroll>
  );
}

const Main = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  background: var(--panel-wash);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  overflow: hidden;
`;

const Sidebar = styled.div`
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 10px;
  border-right: 1px solid var(--border);
  overflow-y: auto;
`;

const SidebarHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
`;

const SidebarTitle = styled.h1`
  font-size: 16px;
  font-weight: 700;
  color: var(--text-strong);
`;

const NewButtons = styled.div`
  display: flex;
  gap: 2px;
`;

const IconTextButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 18px;
  }

  &:hover {
    background: var(--surface-hover);
    color: var(--text);
  }
`;

const SearchWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 6px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--surface-sunken);
  color: var(--text-faint);

  .material-symbols-outlined {
    font-size: 15px;
  }

  &:focus-within {
    border-color: var(--accent);
  }
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 0;
  padding: 6px 0;
  border: none;
  background: transparent;
  color: var(--text-strong);
  font-size: 12px;
  outline: none;

  &::placeholder {
    color: var(--text-faint);
  }
`;

const FilterRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 6px;

  > * {
    font-size: 12px;
  }
`;

const Tree = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-top: 4px;
`;

const EmptyTreeHint = styled.div`
  padding: 8px;
  color: var(--text-faint);
  font-size: 12px;
`;

// The indent per nesting level is a computed value, not one of a fixed set
// of variants, so it is applied as an inline style at each call site (this
// codebase's usual way of handling a genuinely dynamic numeric style — see
// e.g. GanttChart's `style={{ left: ... }}`) rather than threaded through a
// styled-component prop, which emotion forwards straight to the DOM node and
// React then warns about as an unrecognized attribute on a native element.
const depthPadding = (depth: number) => `${6 + depth * 16}px`;

const CategoryRow = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: 6px;
  padding-right: 4px;
  cursor: pointer;

  &:hover {
    background: var(--surface-hover);
  }
`;

const CategoryClickArea = styled.button`
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
  padding: 5px 4px;
  border: none;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left;

  .material-symbols-outlined {
    font-size: 16px;
    color: var(--text-faint);
    flex-shrink: 0;
  }

  &:disabled {
    cursor: default;
  }
`;

const CategoryName = styled.span`
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CategoryCount = styled.span`
  margin-left: 4px;
  color: var(--text-faint);
  font-size: 11px;
`;

const RenameInput = styled.input`
  flex: 1;
  min-width: 0;
  padding: 2px 4px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: var(--surface);
  color: var(--text-strong);
  font-size: 12.5px;
  font-weight: 600;
  outline: none;
`;

const RowActions = styled.div`
  display: none;
  gap: 1px;
  flex-shrink: 0;

  ${CategoryRow}:hover & {
    display: flex;
  }
`;

const RowActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 14px;
  }

  &:hover {
    background: var(--surface);
    color: var(--text);
  }
`;

const SectionLabel = styled.div`
  padding: 8px 6px 2px;
  color: var(--text-faint);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const InlineCategoryInput = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 4px;

  .material-symbols-outlined {
    font-size: 16px;
    color: var(--text-faint);
  }

  input {
    flex: 1;
    min-width: 0;
    padding: 3px 5px;
    border: 1px solid var(--accent);
    border-radius: 4px;
    background: var(--surface);
    color: var(--text-strong);
    font-size: 12.5px;
    outline: none;
  }
`;

const DocRow = styled.div`
  display: flex;
  align-items: center;
  border-radius: 6px;

  &:hover {
    background: var(--surface-hover);
  }

  &[data-active] {
    background: var(--accent-soft);
  }

  &[data-active] button {
    color: var(--accent);
  }
`;

const DocRowButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  padding: 5px 4px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;

  .material-symbols-outlined {
    font-size: 15px;
    color: var(--text-faint);
    flex-shrink: 0;
  }
`;

const DocRowLabel = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ArchivedSection = styled.div`
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
`;

const RestoreButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: 4px;
  flex-shrink: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 15px;
  }

  &:hover {
    background: var(--surface);
    color: var(--text);
  }
`;

const Panel = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const EmptyPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-faint);
  font-size: 13px;

  .material-symbols-outlined {
    font-size: 40px;
    opacity: 0.5;
  }
`;

const EmptyPanelTitle = styled.span`
  max-width: 320px;
  text-align: center;
`;

const DocScroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 32px 48px 64px;

  @media (max-width: 760px) {
    padding: 24px 20px 48px;
  }
`;

const DocHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const DocHeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
`;

const DocIcon = styled.span`
  font-size: 30px;
  color: var(--text-faint);
  flex-shrink: 0;
`;

const DocTitle = styled.h1`
  font-size: 28px;
  font-weight: 800;
  color: var(--text-strong);
  overflow-wrap: break-word;
`;

const DocHeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;

  > button:first-of-type {
    padding: 6px 14px;
    border-radius: 7px;
    border: 1px solid var(--border-strong);
    background: transparent;
    color: var(--text);
    font-size: 13px;
    cursor: pointer;

    &:hover {
      background: var(--surface-hover);
    }
  }
`;

const ArchivedTag = styled.span`
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--text-faint);
  font-size: 12px;
`;

const DocMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  color: var(--text-faint);
  font-size: 12.5px;
`;

const MetaChip = styled.span`
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;

  &[data-lab] {
    background: var(--surface-hover);
    color: var(--text-faint);
  }
`;

const MetaText = styled.span``;

const AttachmentGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
`;

const AttachmentImage = styled.img`
  max-width: 220px;
  max-height: 160px;
  border-radius: 10px;
  border: 1px solid var(--border);
  display: block;
`;

const AttachmentTile = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 240px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: inherit;
  text-decoration: none;
  background: var(--surface);

  &:hover {
    border-color: var(--accent);
  }

  .material-symbols-outlined {
    font-size: 22px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  &[data-expired] {
    opacity: 0.6;
  }
`;

/** Same look as AttachmentTile, as an anchor — a separate component rather
    than an `as="a"` override, since emotion forwards that straight through
    without adjusting the accepted prop types (href/target/rel would not
    type-check against a styled.div). */
const AttachmentTileLink = styled.a`
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 240px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: inherit;
  text-decoration: none;
  background: var(--surface);

  &:hover {
    border-color: var(--accent);
  }

  .material-symbols-outlined {
    font-size: 22px;
    color: var(--text-muted);
    flex-shrink: 0;
  }
`;

const AttachmentTileName = styled.div`
  font-size: 12.5px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const AttachmentTileSize = styled.div`
  font-size: 11px;
  color: var(--text-faint);
`;

/**
 * A minimal "prose" stylesheet for react-markdown's plain-HTML output —
 * that library renders semantic tags with no styling of its own by design.
 */
const Prose = styled.div`
  margin-top: 24px;
  font-size: 15px;
  line-height: 1.75;
  color: var(--text);

  h1, h2, h3, h4 {
    color: var(--text-strong);
    font-weight: 700;
    margin: 1.4em 0 0.5em;
  }
  h1 { font-size: 1.5em; }
  h2 { font-size: 1.3em; }
  h3 { font-size: 1.1em; }

  p {
    margin: 0.6em 0;
  }

  ul, ol {
    margin: 0.6em 0;
    padding-left: 1.4em;
  }

  li {
    margin: 0.2em 0;
  }

  li > input[type="checkbox"] {
    margin-right: 6px;
  }

  a {
    color: var(--accent);
  }

  strong {
    color: var(--text-strong);
  }

  code {
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--surface-sunken);
    font-size: 0.9em;
  }

  pre {
    padding: 12px 14px;
    border-radius: 8px;
    background: var(--surface-sunken);
    overflow-x: auto;
  }

  pre code {
    padding: 0;
    background: transparent;
  }

  blockquote {
    margin: 0.8em 0;
    padding: 2px 14px;
    border-left: 3px solid var(--border-strong);
    color: var(--text-muted);
  }

  hr {
    margin: 1.6em 0;
    border: none;
    border-top: 1px solid var(--border);
  }

  table {
    border-collapse: collapse;
    margin: 0.8em 0;
    font-size: 0.92em;
  }

  th, td {
    padding: 6px 10px;
    border: 1px solid var(--border);
  }

  th {
    background: var(--surface-hover);
  }

  img {
    max-width: 100%;
    border-radius: 8px;
  }
`;

const EmptyBodyHint = styled.p`
  color: var(--text-faint);
  font-size: 13px;
`;

const EditorTitleInput = styled.input`
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-strong);
  font-size: 28px;
  font-weight: 800;

  &::placeholder {
    color: var(--text-faint);
  }
`;

const EditorMetaRow = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 16px;

  > * {
    flex: 1;
    min-width: 0;
  }
`;

const EditorField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 16px;

  label {
    font-size: 12px;
    color: var(--text-muted);
  }
`;

const BodyLabelRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  label {
    font-size: 12px;
    color: var(--text-muted);
  }
`;

const AttachButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  padding: 6px 12px 6px 9px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 16px;
  }

  &:hover {
    background: var(--surface-hover);
  }
`;

const AttachmentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
`;

const AttachmentItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;

  > .material-symbols-outlined {
    font-size: 20px;
    color: var(--text-muted);
    flex-shrink: 0;
  }
`;

const AttachmentThumb = styled.img`
  width: 32px;
  height: 32px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  display: block;
`;

const AttachmentMeta = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
`;

const AttachmentName = styled.a`
  font-size: 12px;
  color: var(--text);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    color: var(--accent);
    text-decoration: underline;
  }
`;

const AttachmentSize = styled.span`
  font-size: 11px;
  color: var(--text-faint);
`;

const RemoveAttachmentButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 16px;
  }

  &:hover:not(:disabled) {
    background: var(--surface-hover);
    color: var(--danger);
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

const BodyTextarea = styled.textarea`
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--surface-sunken);
  color: var(--text-strong);
  font-size: 13.5px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  line-height: 1.6;
  outline: none;
  resize: vertical;
  min-height: 320px;

  &:focus {
    border-color: var(--border-strong);
  }

  &::placeholder {
    color: var(--text-faint);
    white-space: pre-wrap;
  }
`;

const EditorActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;

  button {
    padding: 8px 16px;
    border-radius: 7px;
    border: 1px solid transparent;
    font-size: 13px;
    cursor: pointer;
  }

  button:first-of-type {
    background: transparent;
    border-color: var(--border-strong);
    color: var(--text-muted);

    &:hover {
      background: var(--surface-hover);
      color: var(--text);
    }
  }

  button:last-of-type {
    background: var(--selected-bg);
    border-color: var(--selected-bg);
    color: var(--selected-text);
    font-weight: 600;

    &:hover:not(:disabled) {
      opacity: 0.85;
    }

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }
`;
