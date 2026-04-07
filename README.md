# Portal Santa Magdalena

Portal operativo para clientes, administración y auditoría de la obra Santa Magdalena.

## Stack
- Next.js App Router
- Tailwind CSS
- Supabase Auth + PostgreSQL + Storage

## Preparación
1. Crea el proyecto en Supabase.
2. Pega `supabase/schema.sql` en el SQL Editor y ejecútalo completo.
3. Copia `.env.example` a `.env.local` y completa las llaves.
4. Instala dependencias: `npm install`
5. Crea los usuarios internos iniciales: `npm run bootstrap:init`
6. Inicia el proyecto: `npm run dev`

## Usuarios internos iniciales
El script `bootstrap-users.mjs` deja creados o actualizados estos accesos:

- Admin: `admin`
- Auditor: `rtenorio`

Las contraseñas quedan definidas dentro del mismo script y también se exportan a `credenciales-iniciales.json`.

## Compilación para servidor
```bash
npm run build
npm run start
```

## Despliegue sugerido
- Usa un entorno Node.js que pueda ejecutar Next.js.
- El proyecto ya viene configurado con `basePath: '/santamagdalena'`.
- Para producción, compila y ejecuta desde el servidor o usa la salida `standalone`.
