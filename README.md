# Mesa Norte · CRM de ventas

Mesa Norte es una tienda ficticia de accesorios de escritorio para grabar una demo. La tienda y el tablero corren en tu PC con Node.js 22.13 o superior. Desde esta carpeta, ejecuta npm ci una vez para instalar las dependencias.

[Abre la guía PDF para instalar el CRM con Claude](docs/Gu%C3%ADa%20pr%C3%A1ctica%20-%20Arma%20tu%20CRM%20de%20ventas%20por%20WhatsApp.pdf). Descarga el ZIP, abre la carpeta descomprimida en Claude Code y adjunta la guía junto con el enlace de este repositorio. El primer prompt está en la página 1.

## Primera prueba desde GitHub

Descarga y descomprime el ZIP del repositorio o clona el proyecto. Abre una terminal en la carpeta de package.json y ejecuta npm ci. En Windows abre Abrir ensayo.cmd. En macOS o Linux ejecuta CRM_SCENARIO=1 CRM_PORT=8782 npm start. Abre http://127.0.0.1:8782/crm para probar el historial ficticio sin credenciales. Para conectar tus cuentas sigue los pasos de abajo. GitHub distribuye el código. Para mantener el CRM activo con tu PC apagado necesitas un servidor Node con almacenamiento persistente y acceso privado al panel.

## Abrir y configurar

1. Haz doble clic en `Abrir CRM.cmd` o ejecuta `npm.cmd start` en esta carpeta.
2. Abre la [tienda](http://127.0.0.1:8780/) o el [CRM](http://127.0.0.1:8780/crm). Mantén activa la ventana que ejecuta el servidor.
3. En **Configuración** puedes cambiar el nombre, el número de WhatsApp, el precio, el stock y el modelo de IA. Introduce un número con código de país para habilitar el enlace de WhatsApp en la tienda.
4. **Abrir ensayo con historial** lleva al CRM con dos semanas de datos de ejemplo. **Probar una consulta** en la tienda crea una ficha de ejemplo.

La base SQLite está en `datos/crm.sqlite`. Conserva contactos, mensajes, cotizaciones, visitas y configuración al cerrar. Los datos y las claves quedan excluidos de Git.

## Agente de ventas y WhatsApp por QR

Con Chrome abierto en la tienda, elige **Probar una consulta → Conversar con el agente**. En la ficha, pulsa **Reproducir cliente de prueba** para ver el intercambio o escribe los mensajes uno por uno. El agente pide nombre y empresa, genera el PDF al precio del catálogo y propone cuatro horarios libres con una imagen. Una vez elegido el bloque lo reserva y deriva a ventas. Las reservas se expresan en hora de Santiago. En Agenda puedes elegir el día y abrir una reserva. El historial, los PDF y las imágenes quedan en la base local.

Para tu teléfono, inicia **Abrir CRM.cmd** y entra en **Configuración → Conexiones → Mostrar QR de vinculación**. Desde WhatsApp elige **Dispositivos vinculados → Vincular dispositivo**. Usa un número dedicado al negocio para probar esta integración no oficial de WhatsApp Web (Baileys). Mantén el CRM activo. Si lo reinicias, pulsa Mostrar QR para restaurar la sesión guardada. Para cerrar el vínculo, usa Dispositivos vinculados en tu celular. La sesión y la base SQLite están en datos/ y son privadas. El botón comercial de la tienda abre el chat del número guardado. Con el dispositivo vinculado, prueba escribir desde otro número «¿Tienen 12 kits? ¿Puedo pasar a verlos?». El agente atiende chats individuales nuevos con consultas comerciales. En el ensayo se usa el mismo flujo y todos los envíos quedan locales.

Con OpenRouter desactivado, el agente interpreta productos y cantidades por reglas. Con clave y modelo interpreta lenguaje libre y usa las reglas del catálogo para cotizar. La ruta oficial de Meta descrita más abajo conserva recepción y respuesta manual. La integración QR es independiente.

## Demostración manual para grabar

Abre **Abrir ensayo.cmd** y entra a la [tienda de ensayo](http://127.0.0.1:8782/) o al [CRM de ensayo](http://127.0.0.1:8782/crm). Usa una base separada con 31 consultas ficticias de dos semanas y casos ganados, perdidos y por atender. Los ejemplos se cargan una vez.

CRM significa *Customer Relationship Management* (gestión de relaciones con los clientes). **Cotizaciones abiertas** suma lo cotizado en oportunidades que siguen abiertas. **Ventas ganadas** muestra cuántas oportunidades cerraste y cuánto se cotizó en las ganadas. Ese monto representa cierres registrados en el CRM.

En [Te toca](http://127.0.0.1:8782/crm#te-toca), abre la ficha de Camila. Pidió hablar con ventas para revisar el despacho. Una persona puede leer la conversación, responder y marcarla como atendida. Para mostrar una pérdida, busca a Valentina. Compró en otra tienda porque necesitaba despacho al día siguiente.

1. Abre la tienda y simula el mensaje «¿Tienen 12 kits para equipar una oficina? ¿Puedo pasar a verlos?».
2. Muestra cómo aparece la ficha en el tablero. Abre el ensayo con historial y busca a Camila en **Te toca** para mostrar cómo retomas una conversación con volumen.
3. En la ficha, cotiza 12 kits. El sistema toma el precio del catálogo, calcula el total y guarda la etapa. Luego prueba con 30 kits con el catálogo inicial para mostrar el rechazo por stock insuficiente. La cotización conserva el precio guardado y no compromete existencias.
4. En **Reunión**, elige un día y una hora para ver el producto o coordinar el retiro. Intenta reservar el mismo horario desde otra ficha para mostrar cómo el CRM impide reservar dos veces.

Una forma de explicarlo en cámara: **«La IA me ayuda a escribir. El código revisa el stock, calcula el monto y decide si la hora está libre.»** En el video, puedes mostrar el borrador, corregirlo y confirmar la respuesta tú mismo. La aplicación registra la decisión.

## Conexiones para la siguiente prueba

### OpenRouter

Copia `.env.example` a `.env`, configura `OPENROUTER_API_KEY` y reinicia. Para controlar el gasto, usa una clave de prueba con límite configurado en OpenRouter. En **Configuración**, pega el identificador del modelo Claude o Gemini que elijas del [catálogo de OpenRouter](https://openrouter.ai/models). Con clave y modelo configurados, el agente también envía el texto de cada consulta comercial a OpenRouter para extraer el producto, las unidades y la intención de visita. En una conversación simulada, pulsa **Borrador con IA**. El texto queda en el recuadro para que lo edites. Se envía a OpenRouter la conversación simulada reciente y los nombres de los productos.

Para una grabación puntual, pega tu clave en **Configuración → Conexiones → OpenRouter → Clave temporal**. La clave queda en memoria de la instancia donde la pegaste. **Quitar clave temporal** la retira del CRM. Si necesitas revocar esa clave para que deje de funcionar en cualquier lugar, hazlo en OpenRouter.

### WhatsApp oficial

1. En Meta for Developers, crea una app para WhatsApp y añade tu celular como destinatario del número de prueba. Comprueba el primer envío en Meta. [Inicio rápido de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
2. En `.env`, define el identificador del número, la clave secreta de la app y un token de verificación propio. Para responder también configura el token de acceso de Meta y la versión vigente de Graph API de tu app. Reinicia el servidor.
3. Conecta una URL HTTPS al **puerto 8781** y registra su ruta `/webhook` en Meta. Suscribe el campo `messages` y vincula la app con la cuenta de WhatsApp Business. El puerto 8781 sirve únicamente el receptor. El puerto 8780 queda para tu PC.
4. Pon el número de prueba en **Configuración**. Escribe desde el celular y comprueba que el mensaje de texto aparezca en el tablero. La respuesta se confirma manualmente desde la ficha, dentro de la ventana de 24 horas. Esta versión no envía plantillas.

Para usar un número propio, verifica ante Meta que controlas el número y completa su registro para Cloud API. Si ya lo usas con la aplicación WhatsApp Business y quieres conservarlo allí, revisa [la opción oficial de coexistencia](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/) antes de cambiar nada. La [guía dentro del CRM](http://127.0.0.1:8780/crm?guia=whatsapp#configuracion) sirve de apoyo para grabar.

### Qué mostrar de Supabase

Hoy los contactos, chats y visitas se guardan en SQLite en el PC. Supabase sería una opción si después necesitas guardar esa información en una base compartida en la nube. Conviene mostrarlo como una variante de despliegue en el video.

## Referencia

El recorrido de WhatsApp a ficha toma como referencia el [CRM de Agustín Medina](https://github.com/cuentas-Ailink/crm-whatsapp-ia). Mesa Norte tiene su propio código, diseño y flujo de ventas.

## Resumen de ventas por Gmail

En Configuración → Resumen diario se puede leer el correo de cada uno de los últimos siete días completos, en hora de Santiago. El ensayo usa oportunidades ficticias. En el CRM habitual se excluye el canal de simulación. Las cotizaciones se cuentan por su última emisión guardada y las visitas por el día reservado. El ingreso se informa como monto cotizado en cierres ganados, sin acreditar cobro.

Configura GMAIL_FROM y GMAIL_APP_PASSWORD en el entorno del servidor (contraseña de aplicación de Google para el remitente), reinicia y guarda el correo del dueño o vendedor y la hora de entrega en el CRM habitual. El servidor debe estar encendido. El resumen abarca todo el negocio. Tras una entrega SMTP incierta se indica «revisar entrega» para evitar duplicados. Los cierres históricos importados usan la mejor fecha disponible; los nuevos se registran al cambiar la etapa.
