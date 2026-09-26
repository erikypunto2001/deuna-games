ALTER TABLE deuna_admin.editorial_items
  DROP CONSTRAINT IF EXISTS editorial_items_type_check;

ALTER TABLE deuna_admin.editorial_items
  ADD CONSTRAINT editorial_items_type_check CHECK (
    item_type IN (
      'game',
      'game_update',
      'site_config',
      'home_config',
      'about_config',
      'game_taxonomy',
      'public_pages_config',
      'platform_catalog',
      'software',
      'game_collection'
    )
  );

COMMENT ON CONSTRAINT editorial_items_type_check
  ON deuna_admin.editorial_items IS
  'Tipos editoriales current-only: juegos, actualizaciones, configuracion publica, plataformas, programas y colecciones.';
