Predmet: Zahtev za port forwarding — statička IP adresa [VAŠA_JAVNA_IP]

Poštovani,

Molim vas da na firewall-u/ruteru koji upravlja našom statičkom javnom IP
adresom [VAŠA_JAVNA_IP] podesite port forwarding (NAT) prema internom
serveru [10.230.62.81] u našoj lokalnoj mreži, za sledeće portove:

  - TCP 3000  →  10.230.62.81:3000
  - TCP 5174  →  10.230.62.81:5174

Nije potreban UDP saobraćaj ni na jednom od ova dva porta.

**Kontekst i svrha**

Radi se o internom IT sistemu za upravljanje mrežnom/hardverskom
infrastrukturom (RMM — Remote Monitoring & Management) koji već radi u
lokalnoj mreži. Port 5174 opslužuje web aplikaciju (frontend), a port 3000
REST API (backend) sa kojim aplikacija komunicira. Cilj otvaranja ovih
portova je omogućavanje pristupa aplikaciji van lokalne mreže — pre svega
zato što je aplikacija instalirana kao PWA (Progressive Web App) na mobilnom
telefonu administratora, i mora da može da dosegne server i van kancelarije
(mobilni podaci, druge mreže) da bi push notifikacije i osvežavanje podataka
radili ispravno.

**Bezbednosne napomene**

- Ceo saobraćaj na oba porta ide isključivo preko HTTPS-a (TLS enkripcija).
- Pristup podacima je zaštićen JWT autentikacijom — bez validnog naloga i
  lozinke nije moguć uvid ni u kakve podatke.
- Windows firewall na samom serveru je već podešen da dozvoljava dolazni i
  odlazni saobraćaj na ova dva porta.
- Traže se isključivo ova dva konkretna porta — ništa drugo (npr. RDP, SMB,
  administrativni portovi) ne treba da bude dostupno spolja.

Pošto imamo statičku javnu IP adresu, pravilo bi trebalo da bude trajno i ne
zahteva dinamičko ažuriranje (DDNS).

Molim vas da me obavestite kada je izmena primenjena, ili ako vam trebaju
dodatne informacije (npr. MAC adresa servera, broj ugovora/instalacije, itd.)

Unapred hvala,
[VAŠE IME]
[KONTAKT TELEFON / EMAIL]
[NAZIV FIRME, ako je relevantno]
