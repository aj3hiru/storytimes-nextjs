"use client";

import { useState } from "react";

/** Ports the addItem()/menu-list dynamic add/remove pattern from
 *  admin/header-customizer.php. Drag-to-reorder from the original isn't
 *  replicated — items are still ordered top-to-bottom and saved in that
 *  order, just without drag-and-drop. */
export function MenuItemsEditor({ initial }: { initial: { label: string; url: string }[] }) {
  const [items, setItems] = useState(initial.length > 0 ? initial : [{ label: "", url: "" }]);

  function update(i: number, patch: Partial<{ label: string; url: string }>) {
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }
  function remove(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }
  function add() {
    setItems((prev) => [...prev, { label: "", url: "" }]);
  }

  return (
    <>
      <div className="menu-list">
        {items.map((item, i) => (
          <div className="menu-item-row" key={i}>
            <input name="navLabel" className="form-control" placeholder="Label" value={item.label} onChange={(e) => update(i, { label: e.target.value })} />
            <input name="navUrl" className="form-control" placeholder="/url" value={item.url} onChange={(e) => update(i, { url: e.target.value })} />
            <button type="button" className="mini-btn" onClick={() => remove(i)} aria-label="Remove">
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn-add-menu" onClick={add}>
        <i className="fas fa-plus" /> Add Menu Item
      </button>
    </>
  );
}
