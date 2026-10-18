export interface TechDef {
  id: string;
  name: string;
  era: number;
  /** Zusätzliche Voraussetzungen (neben dem Zeitalter). */
  requires?: string[];
  description: string;
}

/** Grundkosten in Entwicklungspunkten je Zeitalter. */
export const TECH_COST_BY_ERA = [18, 40, 75, 120, 175, 240, 320, 410, 520];

/** Anteil der Technologien eines Zeitalters, der für den Aufstieg nötig ist. */
export const ERA_ADVANCE_SHARE = 0.6;

export const AI_TECH = 'artificialIntelligence';

const t = (id: string, name: string, era: number, description: string, requires?: string[]): TechDef => ({ id, name, era, description, requires });

export const TECHS: Record<string, TechDef> = Object.fromEntries(
  [
    t('agriculture', 'Ackerbau', 0, 'Farmen, Gemüsegärten, Siedler, Kornspeicher'),
    t('pottery', 'Töpferei', 0, 'Vorratsgrube, Lehmgrube, Ziegelei, Plantagen'),
    t('mining', 'Bergbau', 0, 'Minen auf Erzvorkommen'),
    t('animalHusbandry', 'Viehzucht', 0, 'Weiden und Gestüte'),
    t('fishing', 'Fischfang', 0, 'Fischereien an Küsten und Seen'),
    t('mysticism', 'Mystik', 0, 'Heiligtum'),

    t('bronzeWorking', 'Bronzeverarbeitung', 1, 'Speerträger, Bronzegießerei, Sägegrube, Kaserne', ['mining']),
    t('archery', 'Bogenschießen', 1, 'Bogenschützen'),
    t('wheel', 'Rad', 1, 'Streitwagen, Straßenanbindung', ['animalHusbandry']),
    t('sailing', 'Segeln', 1, 'Galeere, Hafen, Einschiffen', ['fishing']),
    t('masonry', 'Mauerwerk', 1, 'Stadtmauer, bessere Steinbrüche', ['mining']),
    t('weaving', 'Weberei', 1, 'Weberei, Schneiderei', ['animalHusbandry']),
    t('writing', 'Schrift', 1, 'Bibliothek, Gelehrte'),
    t('irrigation', 'Bewässerung', 1, 'Farmen Stufe 2', ['agriculture']),

    t('ironWorking', 'Eisenverarbeitung', 2, 'Schwertkämpfer, Schmiede, Minen Stufe 2', ['bronzeWorking']),
    t('horsebackRiding', 'Reiten', 2, 'Reiter', ['wheel']),
    t('mathematics', 'Mathematik', 2, 'Katapult', ['writing']),
    t('shipbuilding', 'Schiffbau', 2, 'Trireme, Fischerei Stufe 2', ['sailing']),
    t('currency', 'Währung', 2, 'Marktplatz, Händler, Handel'),

    t('feudalism', 'Feudalismus', 3, 'Pikeniere, Hochofen'),
    t('machinery', 'Mechanik', 3, 'Armbrustschützen'),
    t('chivalry', 'Rittertum', 3, 'Ritter, Gestüt Stufe 2', ['horsebackRiding']),
    t('navigation', 'Navigation', 3, 'Kogge', ['shipbuilding']),
    t('education', 'Bildung', 3, 'Universität', ['mathematics']),
    t('theology', 'Theologie', 3, 'Kathedrale'),
    t('crop_rotation', 'Fruchtwechsel', 3, 'Farmen Stufe 3, Weiden Stufe 2'),

    t('gunpowder', 'Schießpulver', 4, 'Musketiere'),
    t('metallurgy', 'Metallurgie', 4, 'Kanonen'),
    t('navigation2', 'Hochseeschifffahrt', 4, 'Fregatte', ['navigation']),
    t('banking', 'Bankwesen', 4, 'Bank', ['currency']),
    t('printing', 'Buchdruck', 4, '+10 % Entwicklung', ['education']),

    t('industrialization', 'Industrialisierung', 5, 'Fabrik, Textilfabrik, Ausbaustufen'),
    t('steamPower', 'Dampfkraft', 5, 'Panzerschiff, Minen Stufe 3', ['industrialization']),
    t('railroad', 'Eisenbahn', 5, 'Bahnhof', ['steamPower']),
    t('rifling', 'Gezogene Läufe', 5, 'Schützen', ['gunpowder']),
    t('conscription', 'Wehrpflicht', 5, 'Kavallerie'),
    t('steelworks', 'Stahlwerke', 5, 'Artillerie', ['metallurgy']),

    t('electricity', 'Elektrizität', 6, 'Kraftwerk'),
    t('replaceableParts', 'Austauschbare Teile', 6, 'Infanterie'),
    t('combustion', 'Verbrennungsmotor', 6, 'Panzer, Zerstörer', ['oilDrilling']),
    t('flight', 'Luftfahrt', 6, 'Jagdflugzeug', ['combustion']),
    t('oilDrilling', 'Ölbohrung', 6, 'Ölquelle, Raffinerie'),
    t('refrigeration', 'Kühltechnik', 6, 'Fischerei Stufe 3'),

    t('electronics', 'Elektronik', 7, 'Elektronikwerk', ['electricity']),
    t('computers', 'Computer', 7, 'Mech. Infanterie, Kampfjet, Forschungslabor', ['electronics']),
    t('plastics', 'Kunststoffe', 7, 'Ölquelle Stufe 2', ['oilDrilling']),
    t('composites', 'Verbundwerkstoffe', 7, 'Kampfpanzer', ['plastics']),
    t('networks', 'Netzwerke', 7, 'Rechenzentrum', ['computers']),

    t('robotics', 'Robotik', 8, 'Exo-Soldat, EMP-Geschütz', ['computers']),
    t('fusion', 'Fusionsenergie', 8, '+20 % Arbeitskraft'),
    t(AI_TECH, 'Künstliche Intelligenz', 8, 'Beendet die Menschenphase – die KI erwacht!', ['robotics', 'networks']),
  ].map((d) => [d.id, d]),
);

export function techsOfEra(era: number): TechDef[] {
  return Object.values(TECHS).filter((d) => d.era === era);
}

export function techCost(id: string): number {
  return TECH_COST_BY_ERA[TECHS[id].era];
}
