import type { CountryCode } from "./countries";

/**
 * Common first names and surnames per shipping country. Customers are random
 * pairings of these, so none of them is a real person. Polish surnames are
 * ones that do not change with gender.
 */
export const NAMES: Record<CountryCode, { first: readonly string[]; last: readonly string[] }> = {
  PT: {
    first: ["Ana", "Maria", "Inês", "Beatriz", "Mariana", "Sofia", "Catarina", "Joana", "João", "Pedro", "Tiago", "Miguel", "Rui", "Diogo", "Francisco", "Luís"],
    last: ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Rodrigues", "Martins", "Sousa", "Fernandes", "Gonçalves", "Gomes", "Lopes", "Marques", "Almeida", "Ribeiro"],
  },
  ES: {
    first: ["Lucía", "Carmen", "Laura", "Marta", "Elena", "Paula", "Sara", "Alba", "Javier", "Daniel", "Pablo", "Alejandro", "Sergio", "Adrián", "Carlos", "Diego"],
    last: ["García", "Fernández", "González", "Rodríguez", "López", "Martínez", "Sánchez", "Pérez", "Gómez", "Martín", "Jiménez", "Ruiz", "Hernández", "Díaz", "Moreno", "Muñoz"],
  },
  FR: {
    first: ["Camille", "Léa", "Manon", "Chloé", "Inès", "Julie", "Claire", "Emma", "Lucas", "Hugo", "Louis", "Nathan", "Thomas", "Antoine", "Julien", "Mathieu"],
    last: ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefèvre", "Michel", "Garnier", "Fournier"],
  },
  DE: {
    first: ["Anna", "Laura", "Lena", "Julia", "Sarah", "Lea", "Katharina", "Hannah", "Lukas", "Jonas", "Felix", "Leon", "Maximilian", "Paul", "Tobias", "Jan"],
    last: ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Schulz", "Hoffmann", "Koch", "Richter", "Wolf", "Schröder", "Neumann", "Braun"],
  },
  NL: {
    first: ["Sanne", "Lotte", "Emma", "Fleur", "Anouk", "Lisa", "Femke", "Iris", "Daan", "Bram", "Lars", "Thijs", "Sem", "Ruben", "Jesse", "Niels"],
    last: ["de Jong", "Jansen", "de Vries", "van den Berg", "van Dijk", "Bakker", "Visser", "Smit", "Meijer", "de Boer", "Mulder", "de Groot", "Bos", "Vos", "Peters", "Hendriks"],
  },
  BE: {
    first: ["Marie", "Julie", "Elise", "Charlotte", "Louise", "Laura", "Lien", "Eline", "Lucas", "Arthur", "Louis", "Wout", "Jonas", "Thomas", "Simon", "Maxime"],
    last: ["Peeters", "Janssens", "Maes", "Jacobs", "Mertens", "Willems", "Claes", "Goossens", "Wouters", "De Smet", "Dubois", "Lambert", "Dupont", "Leclercq", "Martens", "Vermeulen"],
  },
  IT: {
    first: ["Giulia", "Francesca", "Sara", "Chiara", "Martina", "Alessia", "Elena", "Valentina", "Marco", "Luca", "Matteo", "Andrea", "Alessandro", "Davide", "Lorenzo", "Simone"],
    last: ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Mancini", "Costa"],
  },
  IE: {
    first: ["Aoife", "Siobhán", "Niamh", "Ciara", "Sinéad", "Emma", "Sarah", "Róisín", "Seán", "Cian", "Oisín", "Conor", "Darragh", "Liam", "Patrick", "Eoin"],
    last: ["Murphy", "Kelly", "O'Sullivan", "Walsh", "Smith", "O'Brien", "Byrne", "Ryan", "O'Connor", "O'Neill", "Doyle", "McCarthy", "Gallagher", "Kennedy", "Lynch", "Quinn"],
  },
  AT: {
    first: ["Anna", "Sophie", "Magdalena", "Theresa", "Valentina", "Johanna", "Lisa", "Katharina", "Florian", "Lukas", "Fabian", "Stefan", "Michael", "Matthias", "Simon", "David"],
    last: ["Gruber", "Huber", "Bauer", "Wagner", "Müller", "Pichler", "Steiner", "Moser", "Mayer", "Hofer", "Leitner", "Berger", "Fuchs", "Eder", "Fischer", "Schmid"],
  },
  DK: {
    first: ["Ida", "Emma", "Freja", "Sofie", "Laura", "Mette", "Maja", "Karen", "Mads", "Rasmus", "Søren", "Frederik", "Mikkel", "Jonas", "Anders", "Jakob"],
    last: ["Jensen", "Nielsen", "Hansen", "Pedersen", "Andersen", "Christensen", "Larsen", "Sørensen", "Rasmussen", "Jørgensen", "Petersen", "Madsen", "Kristensen", "Olsen", "Thomsen", "Poulsen"],
  },
  SE: {
    first: ["Elsa", "Maja", "Astrid", "Ebba", "Wilma", "Linnéa", "Saga", "Klara", "Erik", "Oscar", "Lucas", "Axel", "Hugo", "Viktor", "Gustav", "Albin"],
    last: ["Andersson", "Johansson", "Karlsson", "Nilsson", "Eriksson", "Larsson", "Olsson", "Persson", "Svensson", "Gustafsson", "Pettersson", "Jonsson", "Lindberg", "Lindström", "Berg", "Holm"],
  },
  PL: {
    first: ["Anna", "Zofia", "Julia", "Maja", "Natalia", "Katarzyna", "Aleksandra", "Magdalena", "Jakub", "Piotr", "Tomasz", "Krzysztof", "Michał", "Paweł", "Kacper", "Łukasz"],
    last: ["Nowak", "Wójcik", "Kowalczyk", "Woźniak", "Mazur", "Krawczyk", "Kaczmarek", "Zając", "Król", "Wieczorek", "Wróbel", "Dudek", "Adamczyk", "Pawlak", "Sikora", "Walczak"],
  },
};

/**
 * Pairings that name a well-known real person (athletes, musicians,
 * politicians). The customer generator draws again when it hits one. Add to
 * this list whenever a sample turns up a familiar name.
 */
export const BLOCKED_NAMES: ReadonlySet<string> = new Set([
  "Rui Costa",
  "Diogo Costa",
  "Miguel Oliveira",
  "Pedro Gonçalves",
  "João Pereira",
  "Daniel Martín",
  "Marco Rossi",
  "Andrea Romano",
  "Lena Meyer",
  "Liam Gallagher",
  "Seán Kelly",
  "Patrick Kennedy",
  "Mads Pedersen",
  "Piotr Nowak",
]);

/** Letters that Unicode decomposition does not reduce to ASCII. */
const SPECIAL_LETTERS: Record<string, string> = {
  ß: "ss",
  ø: "o",
  æ: "ae",
  œ: "oe",
  ł: "l",
  đ: "d",
};

/** Lower-case ASCII for an email local part: "Søren" → "soren", "O'Brien" → "obrien". */
export function emailSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ßøæœłđ]/g, (c) => SPECIAL_LETTERS[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
