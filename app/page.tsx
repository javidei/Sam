"use client";

import { useMemo, useState } from "react";

const contactUrl = "https://wa.me/?text=Hola%20SAM%2C%20quiero%20pedir%20informaci%C3%B3n";

const categories = [
  { id: "all", label: "Todo" },
  { id: "impresion", label: "Impresión" },
  { id: "personalizados", label: "Personalizados" },
  { id: "articulos", label: "Artículos" },
  { id: "digital", label: "Digital" },
];

const catalog = [
  {
    category: "impresion",
    eyebrow: "Impresión",
    title: "Documentos y apuntes",
    text: "Copias en blanco y negro o color, distintos tamaños y acabados para estudiar, trabajar o presentar.",
    tag: "Por encargo",
    tone: "blue",
    icon: "Aa",
    terms: "copias documentos apuntes a4 a3 color blanco negro",
  },
  {
    category: "impresion",
    eyebrow: "Acabados",
    title: "Encuadernado y plastificado",
    text: "Protege y presenta tus trabajos, temarios, cartas o documentos con un acabado limpio y duradero.",
    tag: "Servicio",
    tone: "yellow",
    icon: "▤",
    terms: "encuadernado plastificado escaneado documentos",
  },
  {
    category: "personalizados",
    eyebrow: "Personalizados",
    title: "Tazas y detalles únicos",
    text: "Convierte una foto, una frase o una idea en un regalo pensado para esa persona y esa ocasión.",
    tag: "Personalizable",
    tone: "pink",
    icon: "☕",
    terms: "tazas regalos fotos frases cumpleaños",
  },
  {
    category: "personalizados",
    eyebrow: "Textil y decoración",
    title: "Camisetas, bolsas y láminas",
    text: "Diseños para celebraciones, grupos, pequeños negocios o para llevar algo que solo sea tuyo.",
    tag: "Bajo pedido",
    tone: "orange",
    icon: "✦",
    terms: "camisetas tote bolsas laminas carteles vinilo",
  },
  {
    category: "articulos",
    eyebrow: "Artículos",
    title: "Papelería y pequeños detalles",
    text: "Una selección cuidada de material útil, regalos y artículos que acompañan nuestros servicios.",
    tag: "Stock limitado",
    tone: "mint",
    icon: "✎",
    terms: "papeleria articulos detalles material regalos",
  },
  {
    category: "digital",
    eyebrow: "Servicios digitales",
    title: "Diseño listo para usar",
    text: "Currículums, invitaciones, carteles, cartas, menús y piezas digitales entregadas en el formato adecuado.",
    tag: "Entrega digital",
    tone: "violet",
    icon: "⌘",
    terms: "diseño curriculum invitaciones carteles menus cartas pdf digital",
  },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-mark${compact ? " brand-mark--compact" : ""}`} aria-label="SAM">
      <span className="brand-symbol" aria-hidden="true"><i>S</i><i>A</i><i>M</i></span>
      {!compact && <span className="brand-words">Servicios · Arte · Más</span>}
    </span>
  );
}

export default function Home() {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return catalog.filter((item) => {
      const inCategory = filter === "all" || item.category === filter;
      const inSearch = !normalized || `${item.title} ${item.text} ${item.terms}`.toLocaleLowerCase("es").includes(normalized);
      return inCategory && inSearch;
    });
  }, [filter, query]);

  return (
    <>
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <div className="announcement">
        <p>Impresión · Personalizados · Soluciones digitales</p>
        <a href="#contacto">Cuéntanos tu idea <span aria-hidden="true">→</span></a>
      </div>

      <header className="site-header">
        <div className="header-inner">
          <a className="brand-link" href="#inicio" aria-label="SAM, inicio"><Brand compact /></a>
          <button className="menu-button" type="button" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen(!menuOpen)}>
            <span className="sr-only">Abrir menú</span><i></i><i></i><i></i>
          </button>
          <nav id="main-nav" className={`nav${menuOpen ? " is-open" : ""}`} aria-label="Navegación principal">
            <a href="#servicios" onClick={() => setMenuOpen(false)}>Servicios</a>
            <a href="#catalogo" onClick={() => setMenuOpen(false)}>Catálogo</a>
            <a href="#como-funciona" onClick={() => setMenuOpen(false)}>Cómo funciona</a>
            <a href="#contacto" onClick={() => setMenuOpen(false)}>Contacto</a>
          </nav>
          <a className="header-cta" href={contactUrl} target="_blank" rel="noreferrer">Pedir presupuesto</a>
        </div>
      </header>

      <main id="contenido">
        <section className="hero" id="inicio">
          <div className="hero-copy">
            <p className="eyebrow">Imprimimos, personalizamos y damos forma a tus ideas</p>
            <h1>Lo imaginas.<br/><em>Lo hacemos real.</em></h1>
            <p className="hero-lead">En SAM resolvemos tus encargos de impresión, creamos detalles personalizados y preparamos recursos digitales listos para usar.</p>
            <div className="hero-actions">
              <a className="button" href="#catalogo">Descubrir servicios <span aria-hidden="true">↓</span></a>
              <a className="button button--ghost" href={contactUrl} target="_blank" rel="noreferrer">Consultar una idea</a>
            </div>
            <ul className="hero-points" aria-label="Ventajas de SAM">
              <li><span>✓</span> Atención cercana</li>
              <li><span>✓</span> Hecho a medida</li>
              <li><span>✓</span> Recogida o entrega digital</li>
            </ul>
          </div>

          <div className="hero-art" aria-label="Ejemplos de servicios SAM">
            <div className="hero-orbit hero-orbit--one"></div>
            <div className="hero-orbit hero-orbit--two"></div>
            <div className="hero-brand-card"><Brand /><p>Tu idea empieza aquí</p></div>
            <div className="sample-card sample-card--print"><span className="sample-icon">Aa</span><strong>IMPRIME</strong><small>A4 · COLOR</small></div>
            <div className="sample-card sample-card--mug"><span className="mug" aria-hidden="true">SAM</span><strong>PERSONALIZA</strong></div>
            <div className="sample-card sample-card--digital"><span className="digital-window" aria-hidden="true"><i></i><b>sam.</b></span><strong>DISEÑA</strong></div>
            <span className="spark spark--one" aria-hidden="true">✦</span>
            <span className="spark spark--two" aria-hidden="true">✺</span>
          </div>
        </section>

        <section className="services-strip" id="servicios" aria-label="Servicios principales">
          <article><span className="service-number pink">01</span><div><h2>Impresión</h2><p>Documentos, copias y acabados.</p></div></article>
          <article><span className="service-number blue">02</span><div><h2>Personalizados</h2><p>Objetos y detalles con tu diseño.</p></div></article>
          <article><span className="service-number yellow">03</span><div><h2>Digital</h2><p>Diseños y archivos listos para usar.</p></div></article>
        </section>

        <section className="catalog-section" id="catalogo" aria-labelledby="catalog-title">
          <div className="section-heading">
            <div><p className="section-kicker">Soluciones para cada idea</p><h2 id="catalog-title">¿Qué necesitas<br/>hacer realidad?</h2></div>
            <p>Explora nuestros servicios y artículos. Cada encargo puede adaptarse en formato, acabado y cantidad.</p>
          </div>

          <div className="catalog-toolbar">
            <label className="search-box"><span aria-hidden="true">⌕</span><span className="sr-only">Buscar en el catálogo</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busca un servicio o artículo…" /></label>
            <div className="filters" aria-label="Filtrar catálogo">
              {categories.map((category) => <button className={`filter${filter === category.id ? " is-active" : ""}`} key={category.id} type="button" onClick={() => setFilter(category.id)}>{category.label}</button>)}
            </div>
          </div>
          <p className="catalog-result" aria-live="polite">{visible.length === catalog.length && !query ? "Todos los servicios" : `${visible.length} resultado${visible.length === 1 ? "" : "s"}`}</p>

          {visible.length > 0 ? (
            <div className="product-grid">
              {visible.map((item) => (
                <article className={`product-card product-card--${item.tone}`} key={item.title}>
                  <div className="product-visual"><span className="product-icon">{item.icon}</span><span className="product-badge">{item.tag}</span><i></i><i></i></div>
                  <div className="product-copy"><span>{item.eyebrow}</span><h3>{item.title}</h3><p>{item.text}</p><a href={contactUrl} target="_blank" rel="noreferrer">Consultar <span aria-hidden="true">→</span></a></div>
                </article>
              ))}
            </div>
          ) : (
            <div className="catalog-empty"><span aria-hidden="true">⌕</span><h3>No encontramos esa búsqueda</h3><p>Prueba con otra palabra o cuéntanos directamente qué necesitas.</p></div>
          )}
        </section>

        <section className="custom-section" aria-labelledby="custom-title">
          <div className="custom-copy"><p className="section-kicker">Personalización de verdad</p><h2 id="custom-title">No tienes que traer la idea terminada.</h2><p>Una foto, una frase, unos colores o una ocasión especial son suficientes. Te ayudamos a elegir el producto, ajustar el diseño y preparar un resultado que tenga sentido.</p><a className="button button--dark" href={contactUrl} target="_blank" rel="noreferrer">Empezar un encargo</a></div>
          <div className="idea-stack" aria-label="De una idea a un producto personalizado"><div className="idea-note idea-note--one"><span>01</span><strong>Tu idea</strong><p>“Quiero un detalle para…”</p></div><div className="idea-note idea-note--two"><span>02</span><strong>El diseño</strong><p>Revisamos texto, color y formato.</p></div><div className="idea-note idea-note--three"><span>03</span><strong>Hecho</strong><p>Listo para regalar o compartir.</p></div></div>
        </section>

        <section className="process-section" id="como-funciona" aria-labelledby="process-title">
          <div className="process-heading"><p className="section-kicker">Fácil desde el primer mensaje</p><h2 id="process-title">Pide, revisa y recibe.</h2></div>
          <ol className="process-list">
            <li><span>01</span><div><strong>Cuéntanos</strong><p>Explica qué necesitas y envía tu archivo, foto o referencia.</p></div></li>
            <li><span>02</span><div><strong>Revisamos</strong><p>Confirmamos opciones, acabado, plazo y presupuesto antes de empezar.</p></div></li>
            <li><span>03</span><div><strong>Preparamos</strong><p>Realizamos el encargo y te avisamos cuando esté listo.</p></div></li>
            <li><span>04</span><div><strong>Recibe</strong><p>Recógelo o recibe el archivo final si es un servicio digital.</p></div></li>
          </ol>
        </section>

        <section className="contact-section" id="contacto" aria-labelledby="contact-title">
          <div className="contact-intro"><p className="section-kicker">Hablemos de tu idea</p><h2 id="contact-title">¿Qué hacemos hoy?</h2><p>Cuéntanos qué necesitas. Te responderemos con las opciones más adecuadas para tu encargo.</p></div>
          <div className="contact-actions"><a className="contact-card contact-card--primary" href={contactUrl} target="_blank" rel="noreferrer"><span>Consulta directa</span><strong>Abrir WhatsApp</strong><b>→</b></a><div className="contact-card contact-card--secondary"><span>Próximamente</span><strong>Correo por configurar</strong><b>·</b></div><div className="contact-card contact-card--location"><span>Servicio local</span><strong>Palma del Río<br/>Córdoba</strong><b>⌖</b></div></div>
        </section>
      </main>

      <footer><a href="#inicio" aria-label="SAM, volver al inicio"><Brand compact /></a><p>Impresión · Personalizados · Servicios digitales</p><div className="footer-links"><a href="/admin">Administración</a><span>Palma del Río · Córdoba</span></div></footer>
      <a className="floating-contact" href={contactUrl} target="_blank" rel="noreferrer" aria-label="Contactar con SAM">✦</a>
    </>
  );
}
