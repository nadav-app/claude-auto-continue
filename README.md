# המשך אוטומטי (auto-continue)

מוד ל-Claude: כשמגבלת השימוש עוצרת משימה באמצע, המוד קורא את שעת האיפוס ושולח "המשך" אוטומטית דקה אחרי שהמגבלה מתאפסת, כדי שהעבודה תמשיך בלי לבזבז זמן. אם עדיין חסום – מחכה לאיפוס הבא; בלי שעה ידועה מנסה כל 15 דקות, עד 8 ניסיונות.

פקודות: `/auto-continue` (מצב), `/auto-continue cancel` (ביטול), `/auto-continue now` (שליחה מיידית).

## התקנה

בטרמינל של Claude Code:

```
/plugin install auto-continue --marketplace nadav-app/claude-auto-continue
```

ואז `y` להוספת ה-marketplace ובחירת scope (user = כל השיחות).

מה-shell:

```
claude plugin install auto-continue --marketplace nadav-app/claude-auto-continue
```

באפליקציית הדסקטופ: + ליד תיבת ההודעה ← Plugins ← Add marketplace עם `nadav-app/claude-auto-continue` ← Add plugin.
