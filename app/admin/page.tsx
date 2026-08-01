import Link from "next/link";

const products = [
  { icon: "Aa", name: "Impresión de documentos", category: "Impresión", stock: "Servicio", status: "Publicado" },
  { icon: "☕", name: "Taza personalizada", category: "Personalizados", stock: "12 uds.", status: "Publicado" },
  { icon: "✎", name: "Papelería seleccionada", category: "Artículos", stock: "8 uds.", status: "Publicado" },
  { icon: "⌘", name: "Diseño de currículum", category: "Digital", stock: "Servicio", status: "Borrador" },
];

function AdminBrand() {
  return <span className="brand-symbol" aria-label="SAM"><i>S</i><i>A</i><i>M</i></span>;
}

export default function AdminPage() {
  return (
    <main className="admin-page">
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <AdminBrand />
          <p className="admin-label">Gestión</p>
          <nav className="admin-nav" aria-label="Administración">
            <a className="is-active" href="#resumen">Resumen</a>
            <a href="#productos">Productos y servicios</a>
            <a href="#categorias">Categorías</a>
            <a href="#inventario">Inventario</a>
            <a href="#archivos">Imágenes y archivos</a>
            <a href="#ajustes">Ajustes</a>
          </nav>
          <Link className="admin-back" href="/">← Volver a la tienda</Link>
        </aside>

        <section className="admin-main" id="resumen">
          <header className="admin-topbar">
            <div><h1>Buenos días.</h1><p>Aquí tienes el resumen de SAM.</p></div>
            <div className="admin-user" aria-label="Usuario administrador">Admin</div>
          </header>

          <div className="admin-notice">
            <strong>Panel preparado para Supabase</strong>
            <span>La interfaz muestra datos de ejemplo hasta conectar las variables del proyecto y crear el primer usuario administrador.</span>
          </div>

          <div className="stats-grid" aria-label="Resumen del catálogo">
            <article className="stat-card"><span>Publicados</span><strong>5</strong><small><i></i>Visibles en catálogo</small></article>
            <article className="stat-card"><span>Borradores</span><strong>1</strong><small>Pendiente de revisar</small></article>
            <article className="stat-card"><span>Categorías</span><strong>4</strong><small>Catálogo organizado</small></article>
            <article className="stat-card"><span>Stock bajo</span><strong>2</strong><small>Requieren atención</small></article>
          </div>

          <div className="admin-content-grid">
            <section className="admin-panel" id="productos">
              <div className="panel-heading"><h2>Productos y servicios</h2><button type="button">+ Añadir</button></div>
              <table className="product-table">
                <thead><tr><th>Nombre</th><th>Categoría</th><th>Stock</th><th>Estado</th></tr></thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.name}>
                      <td><span className="table-product"><span className="table-thumb">{product.icon}</span>{product.name}</span></td>
                      <td>{product.category}</td><td>{product.stock}</td>
                      <td><span className={`status-pill${product.status === "Borrador" ? " is-draft" : ""}`}>{product.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <aside className="admin-panel">
              <div className="panel-heading"><h2>Acciones rápidas</h2></div>
              <div className="admin-actions">
                <a className="admin-action" href="#productos"><span>+</span><div><strong>Nuevo producto</strong><small>Artículo o servicio</small></div></a>
                <a className="admin-action" href="#inventario"><span>↕</span><div><strong>Ajustar stock</strong><small>Registrar movimiento</small></div></a>
                <a className="admin-action" href="#archivos"><span>▧</span><div><strong>Subir imágenes</strong><small>Galería del catálogo</small></div></a>
                <Link className="admin-action" href="/"><span>↗</span><div><strong>Ver catálogo</strong><small>Abrir zona pública</small></div></Link>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
