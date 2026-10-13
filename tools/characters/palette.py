# The characters' materials as authored in the GLB (their restored look). The game swaps each for a
# ruin-driven material by name (apps/web/src/world/characters/materials.ts), so keep the names in step.

MATERIALS = {
    # shared
    "Stone": dict(colour="#a8916f", rough=0.95),
    "PaleStone": dict(colour="#d8ccb4", rough=0.9),
    "Moss": dict(colour="#4f7a40", rough=1.0),
    "Leaf": dict(colour="#6fa85a", rough=0.9, double=True),
    "Brass": dict(colour="#c99b4a", metal=0.6, rough=0.4),
    "Copper": dict(colour="#b86a3c", metal=0.6, rough=0.45),
    "Iron": dict(colour="#2e2b29", metal=0.5, rough=0.6),
    "Root": dict(colour="#5c4330", rough=1.0),
    "Walnut": dict(colour="#6b4226", rough=0.65),
    "Enamel": dict(colour="#e6dcc4", rough=0.3),
    "Coat": dict(colour="#6e5040", rough=0.95),
    "Scarf": dict(colour="#b0603f", rough=0.95),
    "Feather": dict(colour="#7a5a3e", rough=0.9),
    "Paper": dict(colour="#efe6d2", rough=0.9, double=True),
    # light (warm only: cyan is the network's own)
    "Glass": dict(colour="#ffcf8a", emit="#ffc46b", strength=1.2, rough=0.5),
    "Eye": dict(colour="#ffc070", emit="#ffb050", strength=3.0),
    "Flame": dict(colour="#ffb35a", emit="#ffb35a", strength=4.0),
    "Core": dict(colour="#ffc070", emit="#ffb860", strength=3.0),
}
