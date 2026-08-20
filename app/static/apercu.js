/*
 * Aperçu du PDF pendant la saisie.
 *
 * Le rendu est demandé au serveur, qui utilise le même code que le PDF
 * définitif : ce que voit le collaborateur est exactement ce que recevront les
 * Ressources Humaines. Les appels sont temporisés et le précédent est annulé,
 * pour ne pas multiplier les invocations de fonction.
 *
 * L'aperçu est un confort : sans JavaScript, le formulaire reste pleinement
 * utilisable.
 */
(function () {
  'use strict';

  var DELAI = 900;

  var formulaire = document.getElementById('formulaire-mission');
  var cadre = document.getElementById('apercu-cadre');
  var etat = document.getElementById('apercu-etat');
  if (!formulaire || !cadre || !etat) return;

  var minuteur = null;
  var controleur = null;
  var urlPrecedente = null;
  var derniereSignature = null;

  function signature(donnees) {
    var parties = [];
    donnees.forEach(function (valeur, clef) {
      if (clef !== 'csrf_token') parties.push(clef + '=' + valeur);
    });
    return parties.join('&');
  }

  function rendre() {
    var donnees = new FormData(formulaire);
    var courante = signature(donnees);
    if (courante === derniereSignature) return;
    derniereSignature = courante;

    if (controleur) controleur.abort();
    controleur = new AbortController();

    etat.textContent = 'Génération…';

    fetch(formulaire.dataset.apercu, {
      method: 'POST',
      body: donnees,
      signal: controleur.signal,
      credentials: 'same-origin',
    })
      .then(function (reponse) {
        if (!reponse.ok) throw new Error('aperçu indisponible');
        return reponse.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        if (urlPrecedente) URL.revokeObjectURL(urlPrecedente);
        urlPrecedente = url;
        cadre.src = url + '#toolbar=0&navpanes=0&view=FitH';
        etat.textContent = 'À jour';
      })
      .catch(function (erreur) {
        if (erreur.name === 'AbortError') return;
        etat.textContent = 'Aperçu indisponible';
      });
  }

  function planifier() {
    if (minuteur) clearTimeout(minuteur);
    minuteur = setTimeout(rendre, DELAI);
  }

  formulaire.addEventListener('input', planifier);
  formulaire.addEventListener('change', planifier);
  window.addEventListener('beforeunload', function () {
    if (urlPrecedente) URL.revokeObjectURL(urlPrecedente);
  });

  rendre();
})();
