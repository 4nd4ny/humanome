// Interface ultime — copie autonome en lecture (spec §11, point 2) : un seul
// fichier HTML qui s'ouvre en file://, sans réseau. Même moteur que le site ;
// les données sont embarquées dans <script type="application/json"
// id="carto-data"> et chargées dans un magasin EN MÉMOIRE (rien n'est écrit).

import React from 'react'
import { createRoot } from 'react-dom/client'
import { ViewerApp } from './ViewerApp.jsx'
import { readEmbeddedArchive } from './embedded.js'
import '../../styles/global.css'
import './viewer.css'

const archive = readEmbeddedArchive(document)
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ViewerApp archive={archive} />
  </React.StrictMode>,
)
