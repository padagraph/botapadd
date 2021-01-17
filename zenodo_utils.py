from typing import Dict, List
import requests

from botapad.parser import Botapad
from botapi.botapi import BotaIgraph

API_FILES = "https://zenodo.org/api/records"

class Record:
    __slots__ = ["id", "title", "items"]
    def __init__(self, id, title, items):
        self.id = id
        self.title = title
        self.items = items

    def item_array(self) -> List[Dict]:
        return [{"name":k , "url":f"/zenodo/{self.id}/{k}"} for (k,v) in self.items.items()]

    def __str__(self):
        return f"Record {self.title} with {len(self.items)} items"

def get_record_items(record_id:str) -> Record:
    r = requests.get(API_FILES + "/" + record_id)
    json = r.json()
    title =json["metadata"]["title"]
    items = {item["key"]: item["links"]["self"] for item in r.json()["files"] if item["type"] == "xls"}
    return Record(record_id, title, items)

def get_file_url(record_id, filename) -> str:
    r = get_record_items(record_id)
    return r.items[filename]


def create_pickle():
    bot = BotaIgraph(directed=True)
    pad = Botapad(bot,  "Zenodo", "Zenodo", delete=False, verbose=True, debug=True)
    pad.parse("https://calc.padagraph.io/test-zenodo-composition")
    ig = bot.get_igraph("Zenodo")
    ig.write_pickle("pads/zenodo.pickle")


if __name__ == "__main__":
    print(get_record_items("3708448"))
    create_pickle()


