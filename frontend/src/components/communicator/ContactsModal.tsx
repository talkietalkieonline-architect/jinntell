"use client";
import { useState } from "react";

/* ══════════════════════════════════════════════════════════════
   Мои контакты — записная книжка друзей в JinnTell
   ══════════════════════════════════════════════════════════════ */

interface Contact {
  id: string;
  name: string;
  color: string;
  online: boolean;
  note: string;
  jinntellLink: string;
}

const DEMO_CONTACTS: Contact[] = [
  {
    id: "u1",
    name: "Дима",
    color: "#4CAF50",
    online: true,
    note: "Коллега по работе",
    jinntellLink: "jinntell.com/u/dima",
  },
  {
    id: "u2",
    name: "Настя",
    color: "#E91E63",
    online: true,
    note: "Подруга из универа",
    jinntellLink: "jinntell.com/u/nastya",
  },
  {
    id: "u3",
    name: "Саша",
    color: "#2196F3",
    online: false,
    note: "",
    jinntellLink: "jinntell.com/u/sasha",
  },
  {
    id: "u4",
    name: "Женя",
    color: "#FF9800",
    online: false,
    note: "Сосед",
    jinntellLink: "jinntell.com/u/zhenya",
  },
];

export default function ContactsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [addLink, setAddLink] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  if (!isOpen) return null;

  const contact = selectedContact
    ? DEMO_CONTACTS.find((c) => c.id === selectedContact)
    : null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 100 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />

      <div
        className="relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl p-6"
        style={{
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          backdropFilter: "blur(12px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Мои контакты
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              background: "var(--bg-glass)",
              border: "1px solid var(--bg-glass-border)",
              color: "var(--text-secondary)",
            }}
          >
            ✕
          </button>
        </div>

        {/* Меню контакта */}
        {contact ? (
          <div className="animate-fade-in">
            <button
              onClick={() => setSelectedContact(null)}
              className="text-sm mb-4"
              style={{ color: "var(--accent)" }}
            >
              ‹ Назад
            </button>

            {/* Карточка контакта */}
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-base font-bold"
                style={{
                  background: `${contact.color}22`,
                  border: `2px solid ${contact.color}55`,
                  color: contact.color,
                }}
              >
                {contact.name[0]}
              </div>
              <div>
                <div
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {contact.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      background: contact.online
                        ? "var(--online)"
                        : "var(--offline)",
                    }}
                  />
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {contact.online ? "Онлайн" : "Офлайн"}
                  </span>
                </div>
                {contact.note && (
                  <div
                    className="text-[11px] mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {contact.note}
                  </div>
                )}
              </div>
            </div>

            {/* JinnTell Link */}
            <div
              className="rounded-xl px-4 py-2.5 mb-4 text-[11px]"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--bg-glass-border)",
                color: "var(--text-muted)",
              }}
            >
              {contact.jinntellLink}
            </div>

            {/* Действия */}
            {["Пригласить в комнату", "Оставить сообщение", "Удалить из контактов"].map(
              (action) => {
                const isDanger = action === "Удалить из контактов";
                return (
                  <button
                    key={action}
                    className="w-full text-left px-4 py-3 rounded-xl text-sm mb-1 transition-all"
                    style={{
                      color: isDanger ? "var(--danger)" : "var(--text-primary)",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--bg-glass-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                    onClick={() => {
                      setSelectedContact(null);
                      if (action !== "Удалить из контактов") {
                        onClose();
                      }
                    }}
                  >
                    {action}
                  </button>
                );
              }
            )}
          </div>
        ) : showAdd ? (
          /* Добавить контакт */
          <div className="animate-fade-in">
            <button
              onClick={() => setShowAdd(false)}
              className="text-sm mb-4"
              style={{ color: "var(--accent)" }}
            >
              ‹ Назад
            </button>
            <p
              className="text-sm mb-3"
              style={{ color: "var(--text-secondary)" }}
            >
              Введите JinnTell Link друга:
            </p>
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-4"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--bg-glass-border)",
              }}
            >
              <span
                className="text-sm shrink-0"
                style={{ color: "var(--text-muted)" }}
              >
                jinntell.com/u/
              </span>
              <input
                type="text"
                value={addLink}
                onChange={(e) => setAddLink(e.target.value)}
                placeholder="username"
                className="flex-1 bg-transparent outline-none text-sm"
                style={{
                  color: "var(--text-primary)",
                  caretColor: "var(--accent)",
                }}
              />
            </div>
            <button
              disabled={!addLink.trim()}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: addLink.trim()
                  ? "var(--accent)"
                  : "var(--bg-glass-border)",
                color: addLink.trim()
                  ? "var(--bg-deep)"
                  : "var(--text-muted)",
                cursor: addLink.trim() ? "pointer" : "default",
              }}
              onClick={() => {
                setAddLink("");
                setShowAdd(false);
              }}
            >
              Добавить в контакты
            </button>
          </div>
        ) : (
          /* Список контактов */
          <>
            {/* Мой JinnTell Link */}
            <div
              className="rounded-xl px-4 py-3 mb-4 flex items-center justify-between"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--bg-glass-border)",
              }}
            >
              <div>
                <p
                  className="text-[10px] uppercase tracking-wider mb-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Мой JinnTell Link
                </p>
                <p className="text-sm" style={{ color: "var(--accent)" }}>
                  jinntell.com/u/me
                </p>
              </div>
              <button
                className="text-[10px] px-3 py-1.5 rounded-lg"
                style={{
                  background: "var(--bg-glass-hover)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--bg-glass-border)",
                }}
                onClick={() => navigator.clipboard?.writeText("jinntell.com/u/me")}
              >
                Копировать
              </button>
            </div>

            {/* Список */}
            {DEMO_CONTACTS.length === 0 ? (
              <p
                className="text-center text-sm py-8"
                style={{ color: "var(--text-muted)" }}
              >
                Пока нет контактов. Поделитесь своим JinnTell Link!
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {DEMO_CONTACTS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedContact(c.id)}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all"
                    style={{ background: "transparent" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--bg-glass-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    {/* Аватар */}
                    <div className="relative">
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{
                          background: `${c.color}22`,
                          border: `1.5px solid ${c.color}44`,
                          color: c.color,
                        }}
                      >
                        {c.name[0]}
                      </div>
                      {/* Индикатор онлайн */}
                      <div
                        className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
                        style={{
                          background: c.online
                            ? "var(--online)"
                            : "var(--offline)",
                          borderColor: "var(--panel-bg)",
                        }}
                      />
                    </div>

                    {/* Инфо */}
                    <div className="flex-1">
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {c.name}
                      </span>
                      {c.note && (
                        <p
                          className="text-[11px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {c.note}
                        </p>
                      )}
                    </div>

                    <span
                      style={{ color: "var(--text-muted)", fontSize: "14px" }}
                    >
                      ›
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Кнопка добавления */}
            <button
              onClick={() => setShowAdd(true)}
              className="w-full py-3 rounded-xl text-sm font-semibold mt-4 transition-all hover:scale-[1.02]"
              style={{
                background: "var(--accent)",
                color: "var(--bg-deep)",
              }}
            >
              + Добавить контакт
            </button>
          </>
        )}
      </div>
    </div>
  );
}
