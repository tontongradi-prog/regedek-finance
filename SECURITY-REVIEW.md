# Revue de sécurité — REGEDEK FINANCE

## Résumé

La revue du circuit d’approbation a identifié deux problèmes d’autorisation côté base de données. Les migrations `0004_operation_complement_status.sql` et `0005_operation_approval_workflow.sql` les corrigent sans supprimer de données existantes.

| # | Sévérité | Constat | Correctif |
|---|---|---|---|
| 1 | Haute — confiance 9/10 | Les procédures privilégiées vérifiaient le rôle sans vérifier que le profil était actif. La politique de mise à jour du profil autorisait par ailleurs une réactivation personnelle. | `has_role` exige désormais un profil actif; les utilisateurs authentifiés ne peuvent modifier que leur nom, pas leur état actif. Les décisions et exécutions utilisent ce contrôle côté PostgreSQL. |
| 2 | Haute — confiance 9/10 | Le droit de mise à jour direct sur les comptes permettait de modifier le solde d’ouverture et son indicateur de validation DG. Un solde non validé pouvait aussi alimenter le contrôle d’exécution. | Le droit `UPDATE` est retiré puis accordé uniquement sur les colonnes non protégées; les RPC restent seules autorisées à saisir/valider les soldes. Le solde d’ouverture non validé est exclu du solde affiché et du contrôle d’exécution. |

## Contrôles complémentaires du circuit

- La soumission, la décision DG, la mise en attente, la resoumission après rejet et l’exécution sont des RPC transactionnelles avec contrôle du rôle actif et verrouillage des opérations.
- Les décisions concurrentes sont bloquées par le statut courant et `SELECT ... FOR UPDATE`; le journal d’audit conserve les transitions, l’auteur et les commentaires.
- Le journal d’audit n’est pas modifiable par les rôles ordinaires.
- L’approbation ne crée aucun mouvement comptable. Seule l’exécution, après approbation et contrôle du solde, écrit les mouvements; les transferts créent leurs deux écritures dans la même transaction.
- Les notifications sont adressées par la base de données au responsable financier et aux DG actifs, puis isolées en lecture par destinataire avec RLS.
- Les tests ajoutés vérifient les contrats des migrations et les appels RPC avec un mock; ils ne remplacent pas un test de bout en bout sur PostgreSQL/Supabase.

## Déploiement

Appliquer les migrations dans l’ordre (`0004`, puis `0005`) avant d’utiliser le nouveau statut et les notifications dans l’interface. Les deux fichiers sont dans `drizzle/migrations/`; ce projet ne contient pas de migrations Supabase sous `supabase/migrations/`.

1. Dans le projet Supabase attendu, vérifier dans l’historique de migrations que `0000` à `0003` sont déjà appliquées. Ne pas lancer toute la chaîne Drizzle si son historique ne confirme pas ces migrations : cela risquerait de rejouer le schéma initial.
2. Ouvrir `drizzle/migrations/0004_operation_complement_status.sql` dans l’éditeur SQL Supabase et l’exécuter seul. Vérifier sa réussite avant de poursuivre : le nouveau statut enum doit être validé avant la migration suivante.
3. Exécuter ensuite une seule fois `drizzle/migrations/0005_operation_approval_workflow.sql`. Vérifier que la table `notifications`, ses politiques RLS, les fonctions RPC et les droits modifiés sont présents.
4. Vérifier les rôles et comptes réels dans un environnement de test, puis exécuter les scénarios fonctionnels avant le déploiement.

Ne pas rejouer `0005` en cas de résultat incertain : elle crée des objets non répétables. Contrôler d’abord l’état réel du schéma et l’historique des migrations. Aucune migration n’a été exécutée dans le cadre de cette revue.

Vérifications SQL après application :

```sql
select enumlabel
from pg_enum
where enumtypid = 'public.op_status'::regtype
  and enumlabel = 'en_attente_complement';

select to_regclass('public.notifications');

select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('notifications', 'profiles', 'accounts', 'audit_log')
order by tablename, policyname;
```
