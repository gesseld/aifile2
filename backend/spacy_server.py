import spacy
from flask import Flask, jsonify, request

app = Flask(__name__)
nlp = spacy.load("en_core_web_lg")


@app.route("/process", methods=["POST"])
def process():
    text = request.json["text"]
    doc = nlp(text)
    return jsonify(
        {
            "tokens": [token.text for token in doc],
            "entities": [(ent.text, ent.label_) for ent in doc.ents],
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
