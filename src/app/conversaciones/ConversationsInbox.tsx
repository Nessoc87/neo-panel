"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Mode = "BOT" | "HUMANO";

type Conversation = {
  row_number?: number;
  FechaHora?: string;
  Telefono?: string | number;
  Nombre?: string;
  Direccion?: string;
  Origen?: string;
  TipoMensaje?: string;
  Mensaje?: string;
  Estado?: string;
  Anomalia?: string;
  MediaFileId?: string;
  MediaMimeType?: string;
  MediaCaption?: string;
  DriveFileId?: string;
  SessionId?: string;
  MensajeID?: string;
};

type ApiResponse = {
  ok?: boolean;
  data?: unknown;
  error?: string;
  message?: string;
};

type CustomerThread = {
  key: string;
  telefono: string;
  nombre: string;
  mensajes: Conversation[];
  ultimo: Conversation;
};

function dateValue(value?: string): number {
  if (!value) return 0;

  const timestamp = Date.parse(value.trim().replace(" ", "T"));

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatDate(value?: string): string {
  if (!value) return "Fecha no disponible";

  const timestamp = dateValue(value);
  if (!timestamp) return value;

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatShortTime(value?: string): string {
  if (!value) return "";

  const timestamp = dateValue(value);
  if (!timestamp) return "";

  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function isIncoming(item: Conversation): boolean {
  return String(item.Direccion ?? "").trim().toUpperCase() === "ENTRANTE";
}

function getMessage(item: Conversation): string {
  const message = String(item.Mensaje ?? "").trim();

  if (message) return message;

  if (item.TipoMensaje?.toLowerCase() === "image") {
    return "El cliente envió una imagen.";
  }

  return "(Mensaje sin texto)";
}

export default function ConversationsInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Solo una conversación estará desplegada a la vez.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // De inicio mostramos solo los mensajes recientes; el historial anterior se despliega a petición.
  const [showHistory, setShowHistory] = useState<Record<string, boolean>>({});
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const [modeByPhone, setModeByPhone] = useState<Record<string, Mode>>({});
  const [modeMessage, setModeMessage] = useState<Record<string, string>>({});
  const [modeLoading, setModeLoading] = useState<string | null>(null);

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyMessages, setReplyMessages] = useState<Record<string, string>>({});
  const [replyLoading, setReplyLoading] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/conversations", {
        method: "GET",
        cache: "no-store",
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok) {
        throw new Error(
          result.error || "No fue posible cargar las conversaciones."
        );
      }

      if (!Array.isArray(result.data)) {
        throw new Error("La respuesta de n8n no tiene el formato esperado.");
      }

      setConversations(result.data as Conversation[]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al cargar la bandeja."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Al abrir una conversación o actualizar mensajes, mostrar primero los mensajes más recientes.
  useEffect(() => {
    const contenedor = messagesContainerRef.current;
    if (expandedKey && contenedor) {
      contenedor.scrollTop = contenedor.scrollHeight;
    }
  }, [expandedKey, conversations]);

  const threads = useMemo(() => {
    const groups = new Map<string, Conversation[]>();

    for (const item of conversations) {
      const phone = String(item.Telefono ?? "").trim();
      const name = String(item.Nombre ?? "").trim();

      const key = phone
        ? phone.replace(/\D/g, "")
        : `sin-telefono:${name || "desconocido"}`;

      const current = groups.get(key) || [];
      current.push(item);
      groups.set(key, current);
    }

    const term = search.trim().toLocaleLowerCase();
    const result: CustomerThread[] = [];

    for (const [key, messages] of groups.entries()) {
      const sortedMessages = [...messages].sort(
        (a, b) => dateValue(b.FechaHora) - dateValue(a.FechaHora)
      );

      const latest = sortedMessages[0];
      if (!latest) continue;

      const telefono = String(latest.Telefono ?? "").trim();

      const nombreItem = sortedMessages.find(
        (item) => String(item.Nombre ?? "").trim()
      );

      const nombre =
        String(nombreItem?.Nombre ?? "").trim() || "Cliente sin nombre";

      const searchable = [
        nombre,
        telefono,
        ...sortedMessages.map(getMessage),
      ]
        .join(" ")
        .toLocaleLowerCase();

      if (term && !searchable.includes(term)) continue;

      result.push({
        key,
        telefono,
        nombre,
        mensajes: sortedMessages,
        ultimo: latest,
      });
    }

    return result.sort(
      (a, b) => dateValue(a.ultimo.FechaHora) - dateValue(b.ultimo.FechaHora)
    );
  }, [conversations, search]);

  const incomingCount = conversations.filter(isIncoming).length;

  const outgoingCount = conversations.filter(
    (item) => !isIncoming(item)
  ).length;

  const anomalyCount = conversations.filter(
    (item) => Boolean(item.Anomalia?.trim())
  ).length;

  async function changeMode(thread: CustomerThread, mode: Mode) {
    const phone = thread.telefono;

    if (!phone) {
      setModeMessage((previous) => ({
        ...previous,
        [thread.key]: "Este cliente no tiene un teléfono registrado.",
      }));
      return;
    }

    const description =
      mode === "HUMANO"
        ? "El bot dejará de responder automáticamente a este teléfono."
        : "El bot volverá a responder automáticamente a este teléfono.";

    if (
      !window.confirm(
        `¿Cambiar la atención de ${thread.nombre} (${phone}) a ${mode}?\n\n${description}`
      )
    ) {
      return;
    }

    setModeLoading(thread.key);
    setModeMessage((previous) => ({ ...previous, [thread.key]: "" }));

    try {
      const response = await fetch("/api/conversations/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono: phone, modo: mode }),
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || result.ok !== true) {
        throw new Error(
          result.message || result.error || "No fue posible cambiar el modo."
        );
      }

      setModeByPhone((previous) => ({ ...previous, [phone]: mode }));

      setModeMessage((previous) => ({
        ...previous,
        [thread.key]: result.message || `Modo actualizado a ${mode}.`,
      }));
    } catch (err) {
      setModeMessage((previous) => ({
        ...previous,
        [thread.key]:
          err instanceof Error ? err.message : "Error al cambiar el modo.",
      }));
    } finally {
      setModeLoading(null);
    }
  }

  async function sendManualReply(thread: CustomerThread) {
    const message = String(replyDrafts[thread.key] ?? "").trim();

    if (!thread.telefono) {
      setReplyMessages((previous) => ({
        ...previous,
        [thread.key]: "Este cliente no tiene un teléfono registrado.",
      }));
      return;
    }

    if (!message) {
      setReplyMessages((previous) => ({
        ...previous,
        [thread.key]: "Escribe el mensaje antes de enviarlo.",
      }));
      return;
    }

    if (message.length > 4000) {
      setReplyMessages((previous) => ({
        ...previous,
        [thread.key]: "El mensaje no puede superar 4000 caracteres.",
      }));
      return;
    }

    if (
      !window.confirm(
        `¿Enviar esta respuesta a ${thread.nombre} (${thread.telefono}) por WhatsApp?`
      )
    ) {
      return;
    }

    setReplyLoading(thread.key);
    setReplyMessages((previous) => ({ ...previous, [thread.key]: "" }));

    try {
      const response = await fetch("/api/conversations/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telefono: thread.telefono,
          nombre: thread.nombre,
          mensaje: message,
        }),
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || result.ok !== true) {
        throw new Error(
          result.message ||
            result.error ||
            "No fue posible preparar la respuesta."
        );
      }

      setReplyDrafts((previous) => ({
        ...previous,
        [thread.key]: "",
      }));

      setReplyMessages((previous) => ({
        ...previous,
        [thread.key]:
          result.message ||
          "La respuesta fue aceptada para procesarse mediante n8n.",
      }));

      setModeByPhone((previous) => ({
        ...previous,
        [thread.telefono]: "HUMANO",
      }));

      // Volver a consultar para mostrar el mensaje cuando esté registrado.
      await loadConversations();
    } catch (err) {
      setReplyMessages((previous) => ({
        ...previous,
        [thread.key]:
          err instanceof Error
            ? err.message
            : "Ocurrió un error al preparar la respuesta.",
      }));
    } finally {
      setReplyLoading(null);
    }
  }

  return (
    <main className="neo-app neo-conversations min-h-screen bg-slate-100 text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 px-5 py-5 text-white sm:px-8">
        <div>
          <p className="text-xl font-bold">NEO</p>
          <p className="text-xs tracking-wider text-slate-300">
            TRANSPORTACIONES
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void loadConversations()}
            disabled={loading}
            className="rounded-xl border border-white/20 px-4 py-2 text-sm transition hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? "Actualizando..." : "Actualizar"}
          </button>

          <a
            href="/"
            className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-200"
          >
            Volver al panel
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-5 sm:p-8">
        <section className="neo-inbox-heading">
          <div className="neo-inbox-heading-copy">
            <p className="neo-inbox-eyebrow">ATENCIÓN AL CLIENTE</p>
            <h1>Bandeja de conversaciones</h1>
            <p>Consulta los mensajes por cliente, revisa el historial y responde por WhatsApp desde un solo lugar.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadConversations()}
            disabled={loading}
            className="neo-inbox-refresh"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.5-2L20 12M4 12l2.9 5a7 7 0 0 0 11.5-2"/></svg>
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </section>

        <section className="neo-inbox-stat-tabs" aria-label="Resumen de conversaciones">
          <div className="neo-inbox-stat-tab is-current"><span>Clientes</span><strong>{threads.length}</strong></div>
          <div className="neo-inbox-stat-tab"><span>Mensajes registrados</span><strong>{conversations.length}</strong></div>
          <div className="neo-inbox-stat-tab"><span>Entrantes</span><strong>{incomingCount}</strong></div>
          <div className="neo-inbox-stat-tab"><span>Salientes</span><strong>{outgoingCount}</strong></div>
          <div className="neo-inbox-stat-tab"><span>Alertas</span><strong>{anomalyCount}</strong></div>
        </section>

        <section className="neo-inbox-toolbar">
          <div className="neo-inbox-toolbar-title">
            <p className="neo-inbox-eyebrow">REGISTRO DE ATENCIÓN</p>
            <h2>Conversaciones</h2>
            <p>{threads.length} clientes · selecciona una fila para ver el historial y las acciones.</p>
          </div>
          <div className="neo-inbox-search">
            <label htmlFor="conversationSearch" className="sr-only">Buscar clientes y mensajes</label>
            <div className="neo-inbox-search-field">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
              <input
                id="conversationSearch"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nombre, teléfono o mensaje..."
              />
            </div>
            <button type="button" onClick={() => setSearch("")} disabled={!search} className="neo-inbox-clear">
              Limpiar
            </button>
          </div>
        </section>

        <section className="neo-inbox-results">
          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"
            >
              <p className="font-semibold">No pudimos cargar la bandeja.</p>
              <p className="mt-2">{error}</p>
              <button
                onClick={() => void loadConversations()}
                className="mt-4 rounded-lg bg-red-800 px-4 py-2 font-semibold text-white hover:bg-red-700"
              >
                Intentar nuevamente
              </button>
            </div>
          )}

          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Cargando conversaciones...
            </div>
          )}

          {!loading && !error && threads.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <p className="font-semibold">No encontramos clientes.</p>
              <p className="mt-2 text-sm text-slate-500">
                Prueba otra búsqueda o actualiza la bandeja.
              </p>
            </div>
          )}

          {!loading && !error && threads.length > 0 && (
            <div className="neo-conversation-table">
              <div className="neo-conversation-table-header" aria-hidden="true">
                <span>Cliente</span>
                <span>Último mensaje</span>
                <span>Dirección</span>
                <span>Última actividad</span>
                <span>Atención</span>
                <span>Mensajes</span>
              </div>
              <div className="neo-conversation-table-body">
              {threads.map((thread) => {
                const isExpanded = expandedKey === thread.key;
                const currentMode = modeByPhone[thread.telefono];
                const modeBusy = modeLoading === thread.key;
                const replyBusy = replyLoading === thread.key;

                const chronologicalMessages = [...thread.mensajes].sort(
                  (a, b) => dateValue(a.FechaHora) - dateValue(b.FechaHora)
                );
                const recentLimit = 10;
                const olderCount = Math.max(0, chronologicalMessages.length - recentLimit);
                const historyIsVisible = showHistory[thread.key] === true;
                const visibleMessages = historyIsVisible
                  ? chronologicalMessages
                  : chronologicalMessages.slice(-recentLimit);

                return (
                  <article
                    key={thread.key}
                    className="neo-thread"
                  >
                    {/* Fila tabular compacta; la selección abre el detalle conservado. */}
                    <button
                      type="button"
                      onClick={() => setExpandedKey(isExpanded ? null : thread.key)}
                      aria-expanded={isExpanded}
                      className="neo-conversation-summary-row"
                    >
                      <span className="neo-conversation-customer">
                        <span className="neo-conversation-avatar">
                          {thread.nombre.charAt(0).toUpperCase()}
                        </span>
                        <span className="neo-conversation-customer-text">
                          <strong>{thread.nombre}</strong>
                          <small>{thread.telefono || "Teléfono no registrado"}</small>
                        </span>
                      </span>

                      <span className="neo-conversation-last-message" title={getMessage(thread.ultimo)}>
                        <span>{getMessage(thread.ultimo)}</span>
                        <small>{thread.ultimo.MediaFileId || thread.ultimo.DriveFileId ? "Mensaje con archivo adjunto" : "Mensaje de WhatsApp"}</small>
                      </span>

                      <span className={`neo-conversation-direction ${isIncoming(thread.ultimo) ? "is-incoming" : "is-outgoing"}`}>
                        {isIncoming(thread.ultimo) ? "Entrante" : "Saliente"}
                      </span>

                      <span className="neo-conversation-date">
                        <strong>{formatShortTime(thread.ultimo.FechaHora) || "—"}</strong>
                        <small>{formatDate(thread.ultimo.FechaHora).split(",")[0]}</small>
                      </span>

                      <span className="neo-conversation-attention">
                        <span className={`neo-mode-pill ${currentMode === "HUMANO" ? "is-human" : currentMode === "BOT" ? "is-bot" : "is-unknown"}`}>
                          {currentMode || "Sin consultar"}
                        </span>
                      </span>

                      <span className="neo-conversation-message-count">
                        <strong>{thread.mensajes.length}</strong>
                        <span aria-hidden="true">{isExpanded ? "⌃" : "⌄"}</span>
                      </span>
                    </button>

                    {/* Contenido desplegado al seleccionar al cliente */}
                    {isExpanded && (
                      <div className="neo-conversation-detail">
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3 sm:px-5">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              {thread.nombre}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {thread.telefono || "Teléfono no registrado"}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                                currentMode === "HUMANO"
                                  ? "bg-amber-100 text-amber-900"
                                  : currentMode === "BOT"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {currentMode
                                ? `Modo cambiado aquí: ${currentMode}`
                                : "Modo actual no consultado"}
                            </span>

                            <span className="text-xs text-slate-400">
                              {thread.mensajes.length} mensajes
                            </span>
                          </div>
                        </div>

                        {/* El historial anterior permanece plegado hasta que el usuario lo solicite. */}
                        {olderCount > 0 && (
                          <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
                            <button
                              type="button"
                              onClick={() => setShowHistory((previous) => ({ ...previous, [thread.key]: !historyIsVisible }))}
                              aria-expanded={historyIsVisible}
                              className="rounded-lg border border-cyan-200 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700"
                            >
                              {historyIsVisible
                                ? "Ocultar historial anterior"
                                : `Ver historial anterior (${olderCount} mensajes)`}
                            </button>
                          </div>
                        )}

                        {/* Mensajes recientes: los más nuevos quedan abajo y se muestran al abrir. */}
                        <div ref={messagesContainerRef} className="neo-message-scroll max-h-[520px] space-y-3 overflow-y-auto bg-slate-50 p-4 sm:p-5">
                          {visibleMessages.map((message, index) => {
                            const incoming = isIncoming(message);

                            return (
                              <div
                                key={
                                  message.MensajeID ||
                                  `${message.FechaHora}-${message.row_number ?? index}`
                                }
                                className={`flex ${
                                  incoming ? "justify-start" : "justify-end"
                                }`}
                              >
                                <div
                                  className={`neo-message-bubble w-full max-w-2xl rounded-2xl border p-3 sm:p-4 ${
                                    incoming
                                      ? "neo-message-incoming border-slate-200 bg-white"
                                      : "neo-message-outgoing border-violet-100 bg-violet-50"
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-slate-600">
                                      {incoming ? thread.nombre : "Neo"}
                                    </span>

                                    <span className="text-xs text-slate-400">
                                      {formatDate(message.FechaHora)}
                                    </span>
                                  </div>

                                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                                    {getMessage(message)}
                                  </p>

                                  {message.MediaCaption && (
                                    <p className="mt-2 text-xs text-slate-500">
                                      {message.MediaCaption}
                                    </p>
                                  )}

                                  {message.MediaFileId && (
                                    <p className="mt-2 text-xs text-cyan-800">
                                      Adjunto de WhatsApp registrado
                                    </p>
                                  )}

                                  {message.DriveFileId && (
                                    <p className="mt-1 text-xs text-slate-500">
                                      Archivo registrado en Google Drive
                                    </p>
                                  )}

                                  {message.Anomalia?.trim() && (
                                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                      <p className="font-semibold">Alerta</p>
                                      <p className="mt-1 whitespace-pre-wrap break-words">
                                        {message.Anomalia}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Controles de atención y respuesta */}
                        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
                          <section>
                            <h4 className="mb-3 text-sm font-semibold text-slate-800">
                              Control de atención
                            </h4>

                            <button
                              onClick={() => void changeMode(thread, "HUMANO")}
                              disabled={
                                modeBusy ||
                                !thread.telefono ||
                                currentMode === "HUMANO"
                              }
                              className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {modeBusy ? "Guardando..." : "Tomar control"}
                            </button>

                            <button
                              onClick={() => void changeMode(thread, "BOT")}
                              disabled={
                                modeBusy ||
                                !thread.telefono ||
                                currentMode === "BOT"
                              }
                              className="mt-2 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {modeBusy ? "Guardando..." : "Reactivar BOT"}
                            </button>

                            {modeMessage[thread.key] && (
                              <div
                                role="status"
                                className="mt-3 break-words rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700"
                              >
                                {modeMessage[thread.key]}
                              </div>
                            )}
                          </section>

                          <section>
                            <h4 className="mb-3 text-sm font-semibold text-slate-800">
                              Responder por WhatsApp
                            </h4>

                            <textarea
                              value={replyDrafts[thread.key] || ""}
                              onChange={(event) =>
                                setReplyDrafts((previous) => ({
                                  ...previous,
                                  [thread.key]: event.target.value,
                                }))
                              }
                              maxLength={4000}
                              rows={4}
                              disabled={!thread.telefono || replyBusy}
                              placeholder="Escribe tu respuesta al cliente..."
                              className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100"
                            />

                            <div className="mt-2 flex items-center justify-between gap-3">
                              <span className="text-xs text-slate-400">
                                {(replyDrafts[thread.key] || "").length}/4000
                              </span>

                              <button
                                onClick={() => void sendManualReply(thread)}
                                disabled={
                                  replyBusy ||
                                  !thread.telefono ||
                                  !(replyDrafts[thread.key] || "").trim()
                                }
                                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {replyBusy ? "Procesando..." : "Enviar respuesta"}
                              </button>
                            </div>

                            {replyMessages[thread.key] && (
                              <div
                                role="status"
                                className="mt-3 break-words rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700"
                              >
                                {replyMessages[thread.key]}
                              </div>
                            )}

                            <p className="mt-3 text-xs leading-5 text-slate-500">
                              La respuesta se procesa mediante el workflow
                              existente de respuestas humanas.
                            </p>
                          </section>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
              </div>
            </div>
          )}
        </section>

        <footer className="py-8 text-center text-xs text-slate-400">
          Neo Transportaciones · Bandeja de conversaciones
        </footer>
      </div>
    </main>
  );
}