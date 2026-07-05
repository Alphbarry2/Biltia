import { redirect } from "next/navigation";

// L'Expert BTP est fusionné dans le copilote de l'atelier : poser une question
// dans la barre → réponse texte sourcée (RAG + workspace). Une seule porte
// d'entrée, plus de doublon avec la base de connaissances des Paramètres
// (qui, elle, sert à NOURRIR le corpus).
export default function ExpertPage() {
  redirect("/generate");
}
